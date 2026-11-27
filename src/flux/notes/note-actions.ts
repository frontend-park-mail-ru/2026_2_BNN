import { api, ApiError, isOfflineError } from "@/api";
import type { BlockInput, Note } from "@/types/note";
import { dispatcher } from "@/flux/app-dispatcher";
import type { NoteStateItem, SaveStatus, LoadError } from "@/flux/notes/note-action-types";
import type { Tag } from "@/types/tag";
import { notesStore } from "@/flux/notes/note-store";
import { tagStore } from "@/flux/tags/tag-store";
import { normalizeNote } from "@/flux/notes/note-mapper";
import type { ReadonlyState } from "@/flux/base-store";

const NOTES_LIMIT = 100;
const DETAILS_CONCURRENCY = 4;
let sessionVersion = 0;
let notesRequest: Promise<void> | null = null;
let favoritesRequest: Promise<void> | null = null;
const deletedDuringFavoritesLoad = new Set<string>();
let detailsRequest: Promise<void> | null = null;
const noteRequests = new Map<string, Promise<void>>();
const revisions = new Map<string, number>();
const tagOverrides = new Map<string, Tag | null>();

dispatcher.register((action) => {
  if (action.type === "auth/data-cleared") {
    sessionVersion += 1;
    notesRequest = null;
    favoritesRequest = null;
    deletedDuringFavoritesLoad.clear();
    detailsRequest = null;
    noteRequests.clear();
    revisions.clear();
    tagOverrides.clear();
  }
  if (
    action.type === "notes/updated" ||
    action.type === "notes/deleted" ||
    (action.type === "notes/note-load-failed" && action.error === "missing")
  ) {
    const id = action.type === "notes/updated" ? action.note.id : action.id;
    revisions.set(id, (revisions.get(id) ?? 0) + 1);
  }
  if (action.type === "tags/saved") tagOverrides.set(action.tag.id, action.tag);
  if (action.type === "notes/deleted" && favoritesRequest)
    deletedDuringFavoritesLoad.add(action.id);
  if (action.type === "tags/deleted") tagOverrides.set(action.id, null);
});

/** Загружает отметки один раз за сессию. После ошибки вызов можно повторить. */
export function loadFavorites(): Promise<void> {
  if (favoritesRequest) return favoritesRequest;
  if (notesStore.getState().favoritesStatus === "ready") return Promise.resolve();
  const version = sessionVersion;
  const request = api
    .getFavorites()
    .then((notes) => {
      if (version !== sessionVersion) return;
      const ids = notes.map((note) => note.id).filter((id) => !deletedDuringFavoritesLoad.has(id));
      dispatcher.dispatch({ type: "notes/favorites-loaded", ids });
    })
    .catch(() => {
      if (version === sessionVersion) dispatcher.dispatch({ type: "notes/favorites-failed" });
    })
    .finally(() => {
      if (version === sessionVersion) {
        favoritesRequest = null;
        deletedDuringFavoritesLoad.clear();
      }
    });
  favoritesRequest = request;
  dispatcher.dispatch({ type: "notes/favorites-loading" });
  return request;
}

/** Меняет отметку только после подтверждения сервера. */
export async function toggleFavorite(id: string): Promise<void> {
  const state = notesStore.getState();
  if (state.favoritesStatus !== "ready" || id === "new" || state.pendingFavoriteIds.includes(id))
    return;
  const version = sessionVersion;
  const favorite = !state.favoriteIds.includes(id);
  dispatcher.dispatch({ type: "notes/favorite-pending", id });
  try {
    await api.setFavorite(id, favorite);
  } catch (error) {
    if (version !== sessionVersion) return;
    dispatcher.dispatch({ type: "notes/favorite-finished", id });
    throw error;
  }
  if (version === sessionVersion)
    dispatcher.dispatch({ type: "notes/favorite-finished", id, favorite });
}

/**
 * Ждёт запрос и отклоняет его, если за это время вышли или сменили пользователя.
 *
 * @param request Запрос к API.
 * @returns Результат запроса.
 */
async function inCurrentSession<T>(request: Promise<T>): Promise<T> {
  const version = sessionVersion;
  const result = await request;
  if (version !== sessionVersion) {
    throw new Error("Сессия изменилась во время запроса заметки");
  }
  return result;
}

/**
 * Переводит ошибку API в причину, которую понимает store.
 *
 * @param error Пойманная ошибка загрузки.
 * @returns Код ошибки для действия `notes/load-failed` или `notes/note-load-failed`.
 */
function loadError(error: unknown): LoadError {
  if (error instanceof ApiError) {
    if (error.status === 401) return "unauthorized";
    if (error.status === 404 || error.status === 400) return "missing";
  }
  return isOfflineError(error) ? "offline" : "server";
}

/**
 * Приводит ответ API к заметке store и подставляет теги, изменённые после начала запроса.
 *
 * @param note Заметка из API.
 * @returns Заметка для store.
 */
function normalizeLoadedNote(note: Note): NoteStateItem {
  const normalized = normalizeNote(note);
  normalized.tags = normalized.tags.flatMap((tag) => {
    const latest = tagOverrides.has(tag.id) ? tagOverrides.get(tag.id) : tag;
    return latest ? [latest] : [];
  });
  return normalized;
}

/**
 * Копирует заметку из store, чтобы действие не делило объекты с текущим состоянием.
 *
 * @param note Заметка, которую store отдал только для чтения.
 * @returns Изменяемая копия.
 */
function copyNote(note: ReadonlyState<NoteStateItem>): NoteStateItem {
  return {
    ...note,
    blocks: note.blocks.map((block) => ({ ...block, content: { ...block.content } })),
    tags: note.tags.map((tag) => ({ ...tag })),
  };
}

/**
 * Загружает список заметок.
 * Повторный вызов присоединяется к текущему запросу. Готовый список без `retry` не запрашивается снова.
 *
 * @param options `retry` повторяет загрузку, даже если список уже готов.
 */
export function loadNotes(options: { retry?: boolean } = {}): Promise<void> {
  if (notesRequest) return notesRequest;
  if (!options.retry && notesStore.getState().status === "ready") return Promise.resolve();
  const version = sessionVersion;
  const startedRevisions = new Map(revisions);
  const initialIds = new Set(notesStore.getState().notes.map((note) => note.id));
  dispatcher.dispatch({ type: "notes/loading" });
  const request = Promise.resolve()
    .then(async () => {
      try {
        const loaded: NoteStateItem[] = [];
        let offset = 0;
        while (version === sessionVersion) {
          const page = await api.getNotes(NOTES_LIMIT, offset);
          if (version !== sessionVersion) return;
          loaded.push(...page.map(normalizeLoadedNote));
          if (page.length < NOTES_LIMIT) break;
          offset += NOTES_LIMIT;
        }
        if (version !== sessionVersion) return;
        const current = notesStore.getState().notes;
        const notes: NoteStateItem[] = loaded.flatMap((note) => {
          const existing = current.find((item) => item.id === note.id);
          const changed = (startedRevisions.get(note.id) ?? 0) !== (revisions.get(note.id) ?? 0);
          if (changed && !existing) return [];
          return [existing && (changed || existing.isLoaded) ? copyNote(existing) : note];
        });
        for (const note of current) {
          if (!initialIds.has(note.id) && !notes.some((item) => item.id === note.id))
            notes.unshift(copyNote(note));
        }
        dispatcher.dispatch({ type: "notes/loaded", notes });
      } catch (error) {
        if (version === sessionVersion)
          dispatcher.dispatch({ type: "notes/load-failed", error: loadError(error) });
      }
    })
    .finally(() => {
      if (notesRequest === request) notesRequest = null;
    });
  notesRequest = request;
  return request;
}

/**
 * Загружает тело и теги одной заметки.
 * Состояние запроса хранится отдельно для каждого id. Уже загруженная заметка не запрашивается снова.
 *
 * @param id Идентификатор заметки.
 * @param options `retry` повторяет запрос после ошибки.
 */
export function loadNote(id: string, options: { retry?: boolean } = {}): Promise<void> {
  const pending = noteRequests.get(id);
  if (pending) return pending;
  const state = notesStore.getState();
  const existing = state.notes.find((note) => note.id === id);
  if (existing?.isLoaded && existing.tagsLoaded) return Promise.resolve();
  if (!options.retry && state.noteLoads[id]?.status === "error") return Promise.resolve();
  const version = sessionVersion;
  const revision = revisions.get(id) ?? 0;
  dispatcher.dispatch({ type: "notes/note-loading", id });
  const request = Promise.resolve()
    .then(async () => {
      try {
        const loaded = await api.getNote(id);
        if (version !== sessionVersion) return;
        const changed = revision !== (revisions.get(id) ?? 0);
        dispatcher.dispatch({
          type: "notes/note-loaded",
          id,
          note: changed ? null : normalizeLoadedNote(loaded),
        });
      } catch (error) {
        if (version !== sessionVersion) return;
        if (revision !== (revisions.get(id) ?? 0)) {
          dispatcher.dispatch({ type: "notes/note-loaded", id, note: null });
        } else {
          dispatcher.dispatch({ type: "notes/note-load-failed", id, error: loadError(error) });
        }
      }
    })
    .finally(() => {
      if (noteRequests.get(id) === request) noteRequests.delete(id);
    });
  noteRequests.set(id, request);
  return request;
}

/**
 * Догружает тела заметок, у которых ещё нет блоков или тегов.
 * Одновременно идёт не больше четырёх запросов. Нужно поиску и фильтру по тегам.
 *
 * @param options `retry` повторяет догрузку после ошибки.
 */
export function loadMissingDetails(
  options: { retry?: boolean; tagsOnly?: boolean; ids?: ReadonlySet<string> } = {}
): Promise<void> {
  if (detailsRequest) return detailsRequest;
  const state = notesStore.getState();
  if (state.status !== "ready" || (!options.retry && state.detailsStatus === "error"))
    return Promise.resolve();
  const queue = state.notes
    .filter(
      (note) =>
        (!options.ids || options.ids.has(note.id)) &&
        (!note.tagsLoaded || (!options.tagsOnly && !note.isLoaded))
    )
    .map((note) => note.id);
  if (!queue.length) return Promise.resolve();
  const version = sessionVersion;
  let failed = false;
  dispatcher.dispatch({ type: "notes/details-status-changed", status: "loading" });
  /** Забирает id из очереди, пока она не опустеет или сессия не сменится. */
  async function worker(): Promise<void> {
    while (queue.length && version === sessionVersion) {
      const id = queue.shift()!;
      await loadNote(id, options);
      if (version !== sessionVersion) return;
      const error = notesStore.getState().noteLoads[id]?.error;
      if (error && error !== "missing") {
        failed = true;
        if (error === "offline" || error === "unauthorized") queue.length = 0;
      }
    }
  }
  const request = Promise.resolve()
    .then(() => Promise.all(Array.from({ length: DETAILS_CONCURRENCY }, worker)))
    .then(() => {
      if (version === sessionVersion)
        dispatcher.dispatch({
          type: "notes/details-status-changed",
          status: failed ? "error" : "ready",
        });
    })
    .finally(() => {
      if (detailsRequest === request) detailsRequest = null;
    });
  detailsRequest = request;
  return request;
}

/**
 * Создаёт заметку и кладёт её в store.
 *
 * @param input Заголовок и родительская заметка. Оба поля необязательны.
 * @returns Созданная заметка в формате API.
 */
export async function createNote(input: {
  title?: string;
  parent_note_id?: string;
}): Promise<Note> {
  const created = await inCurrentSession(api.createNote(input));
  putNote(normalizeLoadedNote({ ...created, blocks: created.blocks ?? [] }));
  return created;
}

/**
 * Сохраняет заголовок, блоки и теги заметки, затем обновляет store.
 * Если ответ не содержит теги, они собираются из справочника и предыдущей заметки.
 *
 * @param id Идентификатор заметки.
 * @param data Новое содержимое.
 * @returns Сохранённая заметка в формате API.
 */
export async function updateNote(
  id: string,
  data: { title: string; blocks: BlockInput[]; tag_ids?: string[] }
): Promise<Note> {
  const saved = await inCurrentSession(api.updateNote(id, data));
  const previous = notesStore.getState().notes.find((note) => note.id === id);
  const note = normalizeLoadedNote(saved);
  if (!Array.isArray(saved.tags)) {
    const known = [...tagStore.getState().tags, ...(previous?.tags ?? [])];
    note.tags = data.tag_ids
      ? data.tag_ids.flatMap((tagId) => {
          const tag = known.find((item) => item.id === tagId);
          return tag ? [tag] : [];
        })
      : [...(previous?.tags ?? [])];
  }
  putNote(note);
  return saved;
}

/**
 * Загружает файл блока. Результат отбрасывается, если сессия сменилась во время запроса.
 *
 * @param blockId Идентификатор блока.
 * @param file Файл с устройства.
 * @returns Вложение с адресом.
 */
export function uploadAttachment(blockId: string, file: File) {
  return inCurrentSession(api.uploadAttachment(blockId, file));
}

/**
 * Удаляет вложение. Запрос отбрасывается, если сессия сменилась.
 *
 * @param id Идентификатор вложения.
 */
export function deleteAttachment(id: string): Promise<void> {
  return inCurrentSession(api.deleteAttachment(id));
}

/**
 * Удаляет заметку на сервере и из store. Ответ 404 считается успехом: заметки уже нет.
 *
 * @param id Идентификатор заметки.
 */
export async function deleteNote(id: string): Promise<void> {
  await inCurrentSession(
    api.deleteNote(id).catch((error) => {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    })
  );
  dispatcher.dispatch({ type: "notes/deleted", id });
}

/**
 * Сообщает store, на каком этапе автосохранение.
 *
 * @param status Новый статус.
 */
export function setSaveStatus(status: SaveStatus): void {
  dispatcher.dispatch({ type: "notes/save-status-changed", status });
}

/**
 * Кладёт заметку в store: добавляет новую или заменяет существующую с тем же id.
 *
 * @param note Заметка после создания, сохранения или загрузки.
 */
function putNote(note: NoteStateItem): void {
  dispatcher.dispatch({ type: "notes/updated", note });
}

export async function refreshNote(
  id: string,
  canApply: () => boolean
): Promise<"updated" | "unchanged" | "deferred"> {
  if (!canApply()) return "deferred";

  const version = sessionVersion;
  const revision = revisions.get(id) ?? 0;
  const loaded = await api.getNote(id);

  if (version !== sessionVersion || revision !== (revisions.get(id) ?? 0) || !canApply())
    return "deferred";

  const note = normalizeLoadedNote(loaded);
  const previous = notesStore.getState().notes.find((item) => item.id === id);
  if (
    previous &&
    previous.title === note.title &&
    previous.parentId === note.parentId &&
    JSON.stringify(previous.blocks) === JSON.stringify(note.blocks) &&
    JSON.stringify(previous.tags) === JSON.stringify(note.tags)
  )
    return "unchanged";

  putNote(note);
  return "updated";
}
