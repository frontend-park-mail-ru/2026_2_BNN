import {
  api,
  ApiError,
  type NoteBlock,
  type BlockType,
  type Note as ApiNote,
  type BlockContent,
  type BlockInput,
} from "../api";
import { router, navigate, resetAuthState, type PageContext } from "../router";
import { User } from "../store/app-store";

interface Section {
  href: string;
  icon: string;
  title: string;
}

const SECTIONS: Section[] = [
  { href: "/notes", icon: "file", title: "Все заметки" },
  { href: "/notes/favourites", icon: "heart", title: "Избранное" },
  { href: "/notes/trash", icon: "trash", title: "Корзина" },
];

const NOTIFICATIONS_SECTION: Section = {
  href: "/notes/notifications",
  icon: "bell",
  title: "Уведомления",
};

const ALL_SECTIONS: Section[] = [...SECTIONS, NOTIFICATIONS_SECTION];

const NOTES_LIMIT = 100;
const SEARCH_DELAY = 200;
const SEARCH_RESULTS_LIMIT = 8;
const SKELETON_ROWS = [1, 2, 3, 4, 5, 6];
const SAVE_DELAY = 1000;
const TITLE_MAX_LENGTH = 255;

type SaveStatus = "idle" | "saving" | "saved" | "error";

const SAVE_STATUS: Record<SaveStatus, string> = {
  idle: "",
  saving: "Сохраняется…",
  saved: "Сохранено",
  error: "Не сохранено",
};

interface BlockView {
  id: string;
  type: BlockType;
  text: string;
  checked: boolean;
  placeholder: string;
  isChecklist: boolean;
}

interface Note {
  id: string;
  parentId: string | null;
  title: string;
  blocks: NoteBlock[];
  isLoaded: boolean;
  text: string;
}

interface NoteLink {
  href: string;
  title: string;
}

type NotesStatus = "idle" | "loading" | "ready" | "error" | "unauthorized";

interface NotesStore {
  status: NotesStatus;
  notes: Note[];
  error: string;
}

interface NotesElements {
  page: HTMLElement;
  listRegion: HTMLElement;
  mainRegion: HTMLElement;
  search: HTMLInputElement;
  searchBox: HTMLElement;
  searchResults: HTMLElement;
  logoutDialog: HTMLElement;
}

interface NotesInstance {
  page: HTMLElement;
  search: HTMLInputElement;
  searchBox: HTMLElement;
  searchTimer: number | undefined;
  mainRegion: HTMLElement;
  noteId: string | undefined;
  saveStatus: SaveStatus;
  saveTimer: number | undefined;
  isSaving: boolean;
  hasPendingChanges: boolean;
  onSearchInput: () => void;
  onSearchFocus: () => void;
  onSearchFocusOut: (event: FocusEvent) => void;
  onPageClick: (event: MouseEvent) => void;
  onPageKeyDown: (event: KeyboardEvent) => void;
  saveNote: () => Promise<void>;
  onNoteInput: (event: Event) => void;
  onNoteChange: (event: Event) => void;
  onBeforeUnload: (event: BeforeUnloadEvent) => void;
}

const store: NotesStore = { status: "idle", notes: [], error: "" };

let notesRequest: Promise<void> | null = null;
let mounted: NotesInstance | null = null;
let loadVersion = 0;
let pendingFocusNoteId: string | null = null;

/**
 * Сбрасывает локальное состояние notes-страницы.
 * Используется при logout и смене пользователя.
 *
 * @returns {void}
 */
export function resetNotesStore(): void {
  loadVersion++;
  store.status = "idle";
  store.notes = [];
  store.error = "";
  notesRequest = null;
}

/**
 * Достаёт логин из профиля, который роутер закэшировал в api.
 *
 * @param profile Профиль текущего пользователя или `null`.
 * @returns Логин или пустая строка, если профиля нет.
 */
function getProfileLogin(profile: User | null): string {
  return profile?.login ?? "";
}

/**
 * Находит на отрисованной странице все элементы, с которыми работает mount.
 *
 * @param root Корневой узел текущей страницы.
 * @returns Элементы страницы или `null`, если чего-то не хватает в разметке.
 */
function getNotesElements(root: ParentNode): NotesElements | null {
  const page = root.querySelector<HTMLElement>(".notes");
  if (!page) {
    return null;
  }

  const listRegion = page.querySelector<HTMLElement>("[data-notes-list]");
  const mainRegion = page.querySelector<HTMLElement>("[data-notes-main]");
  const search = page.querySelector<HTMLInputElement>("[data-search]");
  const searchBox = page.querySelector<HTMLElement>(".search");
  const searchResults = page.querySelector<HTMLElement>("[data-search-results]");
  const logoutDialog = page.querySelector<HTMLElement>("[data-logout-dialog]");

  if (!listRegion || !mainRegion || !search || !searchBox || !searchResults || !logoutDialog) {
    return null;
  }

  return { page, listRegion, mainRegion, search, searchBox, searchResults, logoutDialog };
}

/**
 * Извлекает текстовые блоки заметки в массив абзацев.
 *
 * @param note Исходная заметка из API.
 * @returns Непустые тексты блоков по порядку.
 */
function getBlocks(note: ApiNote): NoteBlock[] {
  const blocks: NoteBlock[] = [];

  if (!Array.isArray(note.blocks)) {
    return blocks;
  }

  for (const block of note.blocks) {
    if (block.content) {
      blocks.push(block);
    }
  }
  return blocks;
}

/**
 * Приводит заметку API к формату, удобному для UI.
 *
 * @param note Исходная заметка из API.
 * @returns Заметка для шаблонов и поиска.
 */
function normalizeNote(note: ApiNote): Note {
  const title = note.title || "";
  const blocks = getBlocks(note);

  return {
    id: note.id,
    parentId: note.parent_note_id ?? null,
    title: title,
    blocks: blocks,
    isLoaded: Array.isArray(note.blocks),
    text: blocks.map((block) => block.content.text).join(" "),
  };
}

/**
 * Постранично загружает все заметки пользователя.
 *
 * @returns Все заметки, приведённые к формату UI.
 */
async function fetchAllNotes(): Promise<Note[]> {
  const notes: Note[] = [];
  let offset = 0;

  while (true) {
    const list = await api.getNotes(NOTES_LIMIT, offset);

    for (const note of list) {
      notes.push(normalizeNote(note));
    }

    if (list.length < NOTES_LIMIT) {
      return notes;
    }

    offset += NOTES_LIMIT;
  }
}

/**
 * Возвращает активный раздел по текущему пути.
 *
 * @param path Текущий pathname.
 * @returns Раздел, которому соответствует путь, или «Все заметки».
 */
function getCurrentSection(path: string): Section {
  for (const section of ALL_SECTIONS) {
    if (section.href === path) {
      return section;
    }
  }
  return SECTIONS[0];
}

/**
 * Фильтрует список заметок по поисковому запросу.
 *
 * @param notes Список заметок.
 * @param query Поисковая строка.
 * @returns Заметки, в названии или тексте которых есть запрос.
 */
function filterNotes(notes: Note[], query: string): Note[] {
  const search = query.trim().toLowerCase();

  if (search === "") {
    return notes;
  }

  const result: Note[] = [];
  for (const note of notes) {
    const noteText = (note.title + " " + note.text).toLowerCase();
    if (noteText.includes(search)) {
      result.push(note);
    }
  }
  return result;
}

/**
 * Ищет заметку по id в коллекции.
 *
 * @param notes Коллекция заметок.
 * @param id Идентификатор заметки из route params или parentId.
 * @returns Найденная заметка или `null`.
 */
function findNote(notes: Note[], id: string | null | undefined): Note | null {
  if (!id) {
    return null;
  }

  for (const note of notes) {
    if (note.id === id) {
      return note;
    }
  }

  return null;
}

function putNote(note: Note): void {
  const index = store.notes.findIndex((item) => item.id === note.id);
  if (index === -1) {
    store.notes.unshift(note);
  } else {
    store.notes[index] = note;
  }
}

function toBlockView(block: NoteBlock): BlockView {
  return {
    id: block.id,
    type: block.content.type,
    text: block.content.text,
    checked: block.content.checked === true,
    placeholder: "",
    isChecklist: block.content.type === "checklist",
  };
}

function getEditorBlocks(note: Note): BlockView[] {
  const blocks: BlockView[] = [];

  for (const block of note.blocks) {
    blocks.push(toBlockView(block));
  }

  if (blocks.length === 0) {
    blocks.push({
      id: "",
      type: "text",
      text: "",
      checked: false,
      placeholder: "Начните писать...",
      isChecklist: false,
    });
  }

  return blocks;
}

function createDraft(): Note {
  return { id: "new", parentId: null, title: "", blocks: [], isLoaded: true, text: "" };
}

/**
 * Формирует view-model для Handlebars-шаблонов страницы заметок.
 *
 * @param context Роут-контекст.
 * @returns Данные для шаблонов `notes`, `notes-list` и `notes-main`.
 */
function buildView(context: PageContext, noteId: string | undefined, saveStatus: SaveStatus) {
  const currentSection = getCurrentSection(context.path);
  const currentNote = noteId === "new" ? createDraft() : findNote(store.notes, noteId);

  const isReady = store.status === "ready";
  const isError = store.status === "error";
  const isListLoading = !isReady && !isError;
  const isNoteLoading = currentNote !== null && !currentNote.isLoaded;
  const hasNotes = store.notes.length > 0;
  const hasNote = currentNote !== null && currentNote.isLoaded;

  function isActive(section: Section): boolean {
    return section === currentSection;
  }

  const sections: Array<Section & { isActive: boolean }> = [];
  for (const section of SECTIONS) {
    sections.push({ ...section, isActive: isActive(section) });
  }

  const notes: Array<NoteLink & { isActive: boolean }> = [];
  if (noteId === "new") {
    notes.push({ href: "/notes/" + "new", title: "Без названия", isActive: true });
  }
  for (const note of store.notes) {
    notes.push({
      href: "/notes/" + note.id,
      title: note.title || "Без названия",
      isActive: note === currentNote,
    });
  }

  let title = "";
  let displayTitle = "";
  let blocks: BlockView[] = [];
  const breadcrumbs = [{ href: "/notes", label: "Все заметки" }];

  if (currentNote) {
    title = currentNote.title;
    displayTitle = currentNote.title || "Без названия";
    blocks = getEditorBlocks(currentNote);

    const parentNote = findNote(store.notes, currentNote.parentId);
    if (parentNote) {
      breadcrumbs.push({
        href: "/notes/" + parentNote.id,
        label: parentNote.title || "Без названия",
      });
    }
  }

  return {
    userLogin: getProfileLogin(api.getCachedProfile()),

    sectionTitle: currentSection.title,
    sections: sections,
    mailSection: { ...NOTIFICATIONS_SECTION, isActive: isActive(NOTIFICATIONS_SECTION) },

    isListLoading: isListLoading,
    isLoading: isListLoading || isNoteLoading,
    isError: isError,
    errorMessage: store.error,
    isEmpty: isReady && !hasNotes && !(noteId === "new"),
    isWelcome: isReady && hasNotes && !currentNote,
    skeletonRows: SKELETON_ROWS,

    notes: notes,
    hasNote: hasNote,
    title: title,
    displayTitle: displayTitle,
    blocks: blocks,
    breadcrumbs: breadcrumbs,
    saveStatus: SAVE_STATUS[saveStatus],
  };
}

/**
 * Загружает заметки и обновляет store статуса:
 * `loading -> ready/error/unauthorized`.
 *
 * @returns {Promise<void>}
 */
async function loadNotes(): Promise<void> {
  const version = loadVersion;
  store.status = "loading";
  store.error = "";

  try {
    const notes = await fetchAllNotes();

    if (version !== loadVersion) {
      return;
    }

    store.notes = notes;
    store.status = "ready";
  } catch (error) {
    if (version !== loadVersion) {
      return;
    }

    store.notes = [];

    if (error instanceof ApiError && error.status === 401) {
      store.status = "unauthorized";
      return;
    }

    store.status = "error";
    store.error = error instanceof ApiError ? error.message : "Не удалось связаться с сервером";
  }
}

/**
 * Возвращает текущий запрос заметок или запускает новый.
 *
 * @returns {Promise<void>}
 */
function waitForNotes(): Promise<void> {
  if (store.status !== "loading" || !notesRequest) {
    notesRequest = loadNotes();
  }
  return notesRequest;
}

/**
 * SPA-страница списка/чтения заметок.
 */
export class NotesPage {
  /**
   * Рендерит полный шаблон страницы заметок.
   *
   * @param context Роут-контекст.
   * @returns {Promise<string>}
   */
  async render(context: PageContext): Promise<string> {
    const template = Handlebars.templates["notes"];
    const view = buildView(context, context.params.id, "idle");
    return template(view);
  }

  /**
   * Монтирует обработчики страницы и запускает начальную загрузку данных.
   *
   * @param root Корневой узел текущей страницы.
   * @param context Роут-контекст.
   * @returns {Promise<void>}
   */
  async mount(root: ParentNode, context: PageContext): Promise<void> {
    const elements = getNotesElements(root);
    if (!elements) {
      return;
    }

    const { page, listRegion, mainRegion, search, searchBox, searchResults, logoutDialog } =
      elements;

    const instance: NotesInstance = {
      page: page,
      search: search,
      searchBox: searchBox,
      searchTimer: undefined,
      mainRegion: mainRegion,
      noteId: context.params.id,
      saveStatus: "idle",
      saveTimer: undefined,
      isSaving: false,
      hasPendingChanges: false,
      onSearchInput: onSearchInput,
      onSearchFocus: onSearchFocus,
      onSearchFocusOut: onSearchFocusOut,
      onPageClick: onPageClick,
      onPageKeyDown: onPageKeyDown,
      saveNote: saveNote,
      onNoteInput: onNoteInput,
      onNoteChange: onNoteChange,
      onBeforeUnload: onBeforeUnload,
    };

    async function loadNote(id: string): Promise<void> {
      try {
        const loaded = normalizeNote(await api.getNote(id));

        if (mounted !== instance) {
          return;
        }

        putNote(loaded);
        update();
      } catch (error) {
        if (mounted !== instance) {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          await goToLogin();
          return;
        }

        if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
          history.replaceState(null, "", "/notes");
          await router();
          return;
        }

        store.status = "error";
        store.error = error instanceof ApiError ? error.message : "Не удалось связаться с сервером";
        update();
      }
    }

    function update(): void {
      const view = buildView(context, instance.noteId, instance.saveStatus);
      listRegion.innerHTML = Handlebars.partials["notes-list"](view);
      mainRegion.innerHTML = Handlebars.partials["notes-main"](view);
    }

    async function goToLogin(): Promise<void> {
      resetAuthState("unauthenticated");
      history.replaceState(null, "", "/login");
      await router();
    }

    function checkLoadedNote(): void {
      const id = instance.noteId;
      if (!id || id === "new") {
        return;
      }
      const note = findNote(store.notes, id);
      if (!note || !note.isLoaded) {
        void loadNote(id);
      }
    }

    function focusTitle(): void {
      mainRegion.querySelector<HTMLElement>("[data-note-title]")?.focus();
    }

    function focusPendingTitle(): void {
      if (pendingFocusNoteId !== null && pendingFocusNoteId === instance.noteId) {
        pendingFocusNoteId = null;
        focusTitle();
      }
    }

    async function loadAndShow(): Promise<void> {
      await waitForNotes();

      if (mounted !== instance) {
        return;
      }

      if (store.status === "unauthorized") {
        await goToLogin();
        return;
      }

      update();
      renderSearchResults();
      checkLoadedNote();
      focusPendingTitle();
    }

    /**
     * Показывает под полем поиска заметки, в которых есть введенный текст.
     *
     * @returns {void}
     */
    function renderSearchResults(): void {
      const query = search.value.trim();
      const results: NoteLink[] = [];

      if (query && store.status === "ready") {
        const found = filterNotes(store.notes, query).slice(0, SEARCH_RESULTS_LIMIT);

        for (const note of found) {
          results.push({
            href: "/notes/" + note.id,
            title: note.title,
          });
        }
      }

      const canSearch = query !== "" && store.status === "ready";
      const isSearchActive = searchBox.contains(document.activeElement);

      searchResults.hidden = !canSearch || !isSearchActive;
      searchResults.innerHTML = canSearch
        ? Handlebars.partials["search-results"]({
            hasResults: results.length > 0,
            results: results,
          })
        : "";
    }

    function runSearch(): void {
      instance.searchTimer = undefined;
      renderSearchResults();
    }

    function onSearchInput(): void {
      window.clearTimeout(instance.searchTimer);
      instance.searchTimer = window.setTimeout(runSearch, SEARCH_DELAY);
    }

    function onSearchFocus(): void {
      renderSearchResults();
    }

    function onSearchFocusOut(event: FocusEvent): void {
      const next = event.relatedTarget;
      if (next instanceof Node && searchBox.contains(next)) {
        return;
      }

      searchResults.hidden = true;
    }

    function closeLogoutDialog(): void {
      logoutDialog.hidden = true;
    }

    async function logOut(button: HTMLButtonElement): Promise<void> {
      button.disabled = true;
      await api.logOut().catch(() => null);

      resetAuthState("unauthenticated");
      await navigate("/login");
    }

    function timerSave(): void {
      instance.hasPendingChanges = true;
      setSaveStatus("idle");
      window.clearTimeout(instance.saveTimer);
      instance.saveTimer = window.setTimeout(() => void saveNote(), SAVE_DELAY);
    }

    async function saveNote(): Promise<void> {
      if (instance.isSaving || !instance.hasPendingChanges) {
        setSaveStatus("saving");
        return;
      }

      window.clearTimeout(instance.saveTimer);
      instance.saveTimer = undefined;
      instance.isSaving = true;
      instance.hasPendingChanges = false;

      const title = readTitle();
      const { elements, blocks } = collectBlocks();
      let failed = false;

      try {
        if (instance.noteId === "new") {
          if (title === "" && blocks.length === 0) {
            setSaveStatus("idle");
            return;
          }

          const created = await api.createNote({ title });
          instance.noteId = created.id;
          putNote(normalizeNote({ ...created, blocks: [] }));

          if (mounted === instance) {
            history.replaceState(null, "", "/notes/" + created.id);
            replaceDraftCard(created.id);
          }
        }

        const noteId = instance.noteId;
        if (!noteId) {
          return;
        }

        const saved = await api.updateNote(noteId, { title, blocks });
        applyBlockIds(elements, saved.blocks ?? []);
        putNote(normalizeNote(saved));
        setSaveStatus("saved");
      } catch (error) {
        failed = true;
        instance.hasPendingChanges = true;

        if (error instanceof ApiError && error.status === 401) {
          await goToLogin();
          return;
        }

        setSaveStatus("error");
      } finally {
        instance.isSaving = false;
        if (!failed && instance.hasPendingChanges) {
          timerSave();
        }
      }
    }

    function openDraft(): void {
      if (instance.noteId === "new") {
        focusTitle();
        return;
      }
      pendingFocusNoteId = "new";
      void navigate("/notes/" + "new");
    }

    function readTitle(): string {
      const title = mainRegion.querySelector<HTMLElement>("[data-note-title]");
      return (title?.textContent ?? "").trim().slice(0, TITLE_MAX_LENGTH);
    }

    function collectBlocks(): { elements: HTMLElement[]; blocks: BlockInput[] } {
      const elements: HTMLElement[] = [];
      const blocks: BlockInput[] = [];

      for (const element of mainRegion.querySelectorAll<HTMLElement>("[data-block]")) {
        const text = element.querySelector<HTMLElement>("[data-block-text]")?.innerText ?? "";
        const check = element.querySelector<HTMLInputElement>("[data-block-check]");

        if (text.trim() === "" && !check) {
          continue;
        }

        const content: BlockContent = { type: element.dataset.blockType as BlockType, text };
        if (check) {
          content.checked = check.checked;
        }

        const id = element.dataset.blockId;
        elements.push(element);
        blocks.push(id ? { id, content } : { content });
      }

      return { elements, blocks };
    }

    function applyBlockIds(elements: HTMLElement[], saved: NoteBlock[]): void {
      for (let i = 0; i < elements.length && i < saved.length; i++) {
        elements[i].dataset.blockId = saved[i].id;
      }
    }

    function setSaveStatus(status: SaveStatus): void {
      instance.saveStatus = status;
      const label = mainRegion.querySelector<HTMLElement>("[data-save-status]");
      if (label) {
        label.textContent = SAVE_STATUS[status];
      }
    }

    function showTitleInList(title: string): void {
      const text = title || "Без названия";
      const card = listRegion.querySelector<HTMLElement>(".card_active .card__title");
      if (card) {
        card.textContent = text;
      }
      const crumbs = mainRegion.querySelectorAll<HTMLElement>(".notebook__crumb");
      const last = crumbs[crumbs.length - 1];
      if (last) {
        last.textContent = text;
      }
    }

    function replaceDraftCard(id: string): void {
      const card = listRegion.querySelector<HTMLAnchorElement>(`a[href="/notes/${"new"}"]`);
      if (card) {
        card.href = "/notes/" + id;
      }
    }

    function onPageClick(event: MouseEvent): void {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest("[data-retry]")) {
        store.status = "idle";
        update();
        void loadAndShow();
        return;
      }

      if (target.closest("[data-search-clear]")) {
        window.clearTimeout(instance.searchTimer);
        instance.searchTimer = undefined;
        search.value = "";
        renderSearchResults();
        search.focus();
        return;
      }

      if (target.closest("[data-logout-open]")) {
        logoutDialog.hidden = false;
        return;
      }

      if (target.closest("[data-logout-cancel]") || target === logoutDialog) {
        closeLogoutDialog();
        return;
      }

      const newNoteButton = target.closest<HTMLButtonElement>("[data-new-note]");
      if (newNoteButton) {
        openDraft();
        return;
      }
      const logoutButton = target.closest<HTMLButtonElement>("[data-logout]");
      if (logoutButton) {
        void logOut(logoutButton);
        return;
      }
    }

    function onPageKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") {
        return;
      }

      searchResults.hidden = true;
      closeLogoutDialog();
    }

    function onNoteInput(event: Event): void {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.matches("[data-note-title]")) {
        showTitleInList(readTitle());
      }

      if (target.closest("[data-note-title], [data-block-text]")) {
        timerSave();
      }
    }

    function onNoteChange(event: Event): void {
      if (event.target instanceof HTMLInputElement && event.target.matches("[data-block-check]")) {
        timerSave();
      }
    }

    function onBeforeUnload(event: BeforeUnloadEvent): void {
      if (instance.hasPendingChanges || instance.isSaving) {
        event.preventDefault();
      }
    }

    search.addEventListener("input", onSearchInput);
    search.addEventListener("focus", onSearchFocus);
    searchBox.addEventListener("focusout", onSearchFocusOut);
    page.addEventListener("click", onPageClick);
    page.addEventListener("keydown", onPageKeyDown);
    mainRegion.addEventListener("input", onNoteInput);
    mainRegion.addEventListener("change", onNoteChange);
    window.addEventListener("beforeunload", onBeforeUnload);

    mounted = instance;

    if (store.status === "ready") {
      checkLoadedNote();
      focusPendingTitle();
      return;
    }

    await loadAndShow();
  }

  /**
   * Демонтирует обработчики и таймеры страницы.
   *
   * @returns {void}
   */
  destroy(): void {
    if (!mounted) {
      return;
    }

    window.clearTimeout(mounted.searchTimer);
    mounted.search.removeEventListener("input", mounted.onSearchInput);
    mounted.search.removeEventListener("focus", mounted.onSearchFocus);
    mounted.searchBox.removeEventListener("focusout", mounted.onSearchFocusOut);
    mounted.page.removeEventListener("click", mounted.onPageClick);
    mounted.page.removeEventListener("keydown", mounted.onPageKeyDown);

    window.clearTimeout(mounted.saveTimer);
    if (mounted.hasPendingChanges) {
      void mounted.saveNote();
    }
    mounted.mainRegion.removeEventListener("input", mounted.onNoteInput);
    mounted.mainRegion.removeEventListener("change", mounted.onNoteChange);
    window.removeEventListener("beforeunload", mounted.onBeforeUnload);

    mounted = null;
  }
}
