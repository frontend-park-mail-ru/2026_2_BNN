import {
  api,
  ApiError,
  type NoteBlock,
  type BlockType,
  type Note as ApiNote,
  type BlockContent,
  type BlockInput,
  type Tag,
} from "../api";
import { router, navigate, resetAuthState, type PageContext } from "../router";
import { User } from "../store/app-store";
import {
  TAG_NAME_MAX_LENGTH,
  findTagByName,
  nextTagColor,
  sortTags,
  toTagView,
  type TagView,
} from "../utils/tags";
import { safeResourceUrl } from "../utils/url";
import { mountProfile } from "./profile";
import { mountTagsDialog } from "./tags-dialog";

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
const SEARCH_TAGS_LIMIT = 5;
const DETAILS_CONCURRENCY = 4;
const SKELETON_ROWS = [1, 2, 3, 4, 5, 6];
const SAVE_DELAY = 1000;
const TOAST_DELAY = 4000;
const TITLE_MAX_LENGTH = 255;

const LIST_TYPES: BlockType[] = ["bulleted", "numbered", "checklist"];

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const FILE_ACCEPT = IMAGE_ACCEPT + ",application/pdf";

const BLOCK_OPTIONS: Array<{ type: BlockType; label: string }> = [
  { type: "text", label: "Текст" },
  { type: "heading", label: "Заголовок" },
  { type: "subtitle", label: "Подзаголовок" },
  { type: "bulleted", label: "Маркированный список" },
  { type: "numbered", label: "Нумерованный список" },
  { type: "checklist", label: "Чек-лист" },
  { type: "quote", label: "Цитата" },
  { type: "file", label: "Файл" },
  { type: "image", label: "Изображение" },
];

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
  isChecklist: boolean;
  isAttachment: boolean;
  isImage: boolean;
  url: string;
  contentJson: string;
  isUploading: boolean;
  uploadError: string;
}

interface Note {
  id: string;
  parentId: string | null;
  title: string;
  blocks: NoteBlock[];
  isLoaded: boolean;
  text: string;
  tags: Tag[];
  /** Теги известны: список `/notes/all` их не возвращает. */
  tagsLoaded: boolean;
}

interface NoteLink {
  href: string;
  title: string;
}

type NotesStatus = "idle" | "loading" | "ready" | "error" | "unauthorized";

interface NotesStore {
  status: NotesStatus;
  notes: Note[];
  tags: Tag[];
}

interface NotesElements {
  page: HTMLElement;
  listRegion: HTMLElement;
  mainRegion: HTMLElement;
  search: HTMLInputElement;
  searchBox: HTMLElement;
  searchResults: HTMLElement;
  logoutDialog: HTMLElement;
  deleteDialog: HTMLElement;
  toast: HTMLElement;
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
  saving: Promise<void> | null;
  hasPendingChanges: boolean;
  toastTimer: number | undefined;
  deleting: boolean;
  onSearchInput: () => void;
  onSearchFocusOut: (event: FocusEvent) => void;
  renderSearchResults: () => void;
  onPageClick: (event: MouseEvent) => void;
  onPageKeyDown: (event: KeyboardEvent) => void;
  finishSaving: () => Promise<void>;
  onNoteInput: (event: Event) => void;
  onNoteChange: (event: Event) => void;
  onNoteKeyDown: (event: KeyboardEvent) => void;
  onBeforeUnload: (event: BeforeUnloadEvent) => void;
  onOnline: () => void;
  onOffline: () => void;
  onPaste: (event: ClipboardEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onDetailsLoaded: () => void;
  listFrame: number;
  destroyProfile: () => void;
  destroyTags: () => void;
}

const store: NotesStore = { status: "idle", notes: [], tags: [] };

let notesRequest: Promise<void> | null = null;
let detailsRequest: Promise<void> | null = null;
let detailsFailed = false;
let mounted: NotesInstance | null = null;
let loadVersion = 0;
let pendingFocusNoteId: string | null = null;
let pendingToast = "";
let connectionLost = false;
let activeTagIds: string[] = [];
let tagsCollapsed = false;

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
  store.tags = [];
  notesRequest = null;
  detailsRequest = null;
  activeTagIds = [];
  tagsCollapsed = false;
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
  const deleteDialog = page.querySelector<HTMLElement>("[data-delete-dialog]");
  const toast = page.querySelector<HTMLElement>("[data-toast]");

  if (
    !listRegion ||
    !mainRegion ||
    !search ||
    !searchBox ||
    !searchResults ||
    !logoutDialog ||
    !deleteDialog ||
    !toast
  ) {
    return null;
  }

  return {
    page,
    listRegion,
    mainRegion,
    search,
    searchBox,
    searchResults,
    logoutDialog,
    deleteDialog,
    toast,
  };
}

/**
 * Приводит заметку API к формату, удобному для UI.
 *
 * @param note Исходная заметка из API.
 * @returns Заметка для шаблонов и поиска.
 */
function normalizeNote(note: ApiNote): Note {
  const title = note.title;
  const blocks = note.blocks ?? [];

  return {
    id: note.id,
    parentId: note.parent_note_id ?? null,
    title: title,
    blocks: blocks,
    isLoaded: Array.isArray(note.blocks),
    text: blocks.map((block) => block.content.text).join(" "),
    tags: note.tags ?? [],
    tagsLoaded: Array.isArray(note.blocks) || Array.isArray(note.tags),
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
 * Достаёт из поисковой строки запрос по тегам: `#учёба` ищет только среди тегов.
 *
 * @param query Поисковая строка.
 * @returns Запрос в нижнем регистре и признак поиска только по тегам.
 */
function parseSearch(query: string): { search: string; onlyTags: boolean } {
  const search = query.trim().toLowerCase();
  if (search.startsWith("#")) {
    return { search: search.slice(1).trim(), onlyTags: true };
  }
  return { search, onlyTags: false };
}

/**
 * Фильтрует список заметок по поисковому запросу.
 *
 * @param notes Список заметок.
 * @param query Поисковая строка.
 * @returns Заметки, в названии, тексте или тегах которых есть запрос.
 */
function filterNotes(notes: Note[], query: string): Note[] {
  const { search, onlyTags } = parseSearch(query);

  if (search === "") {
    return onlyTags ? notes.filter((note) => note.tags.length > 0) : notes;
  }

  const result: Note[] = [];
  for (const note of notes) {
    const tagMatch = note.tags.some((tag) => tag.name.toLowerCase().includes(search));
    const noteText = (note.title + " " + note.text).toLowerCase();
    if (tagMatch || (!onlyTags && noteText.includes(search))) {
      result.push(note);
    }
  }
  return result;
}

/**
 * Ищет теги, название которых содержит запрос.
 *
 * @param query Поисковая строка, можно с `#`.
 * @returns Подходящие теги.
 */
function filterTags(query: string): Tag[] {
  const { search } = parseSearch(query);
  if (search === "") {
    return [];
  }
  return store.tags.filter((tag) => tag.name.toLowerCase().includes(search));
}

/**
 * Проверяет, что у заметки есть все теги из фильтра.
 *
 * @param note Заметка.
 * @returns `true`, если заметка проходит фильтр.
 */
function matchesTagFilter(note: Note): boolean {
  return activeTagIds.every((id) => note.tags.some((tag) => tag.id === id));
}

/**
 * Собирает теги по id, подставляя актуальные название и цвет из общего списка.
 *
 * @param ids Идентификаторы тегов.
 * @param fallback Теги заметки на случай, если общего списка нет.
 * @returns Теги в том же порядке.
 */
function tagsByIds(ids: string[], fallback: Tag[]): Tag[] {
  const result: Tag[] = [];
  for (const id of ids) {
    const tag =
      store.tags.find((item) => item.id === id) ?? fallback.find((item) => item.id === id);
    if (tag) {
      result.push(tag);
    }
  }
  return result;
}

/**
 * Добавляет или заменяет тег в общем списке и в загруженных заметках.
 *
 * @param tag Тег из ответа API.
 */
function putTag(tag: Tag): void {
  store.tags = sortTags([...store.tags.filter((item) => item.id !== tag.id), tag]);
  for (const note of store.notes) {
    note.tags = note.tags.map((item) => (item.id === tag.id ? tag : item));
  }
}

/**
 * Убирает тег из общего списка, заметок и фильтра.
 *
 * @param id Идентификатор тега.
 */
function removeTag(id: string): void {
  store.tags = store.tags.filter((tag) => tag.id !== id);
  activeTagIds = activeTagIds.filter((item) => item !== id);
  for (const note of store.notes) {
    note.tags = note.tags.filter((tag) => tag.id !== id);
  }
}

/**
 * Проверяет, есть ли заметки, теги которых ещё не загружены.
 *
 * @returns `true`, если нужно догрузить заметки.
 */
function hasMissingDetails(): boolean {
  return store.notes.some((note) => !note.tagsLoaded);
}

/**
 * Догружает заметки без тегов: список `/notes/all` не возвращает теги,
 * а фильтру и поиску по тегам они нужны.
 *
 * @returns Promise, который завершится после загрузки всех заметок.
 */
function loadMissingDetails(): Promise<void> {
  if (!detailsRequest) {
    detailsRequest = fetchMissingDetails().finally(() => {
      detailsRequest = null;
      mounted?.onDetailsLoaded();
    });
  }
  return detailsRequest;
}

/**
 * Загружает недостающие заметки по одной, не больше `DETAILS_CONCURRENCY` одновременно.
 *
 * @returns {Promise<void>}
 */
async function fetchMissingDetails(): Promise<void> {
  const version = loadVersion;
  const queue = store.notes.filter((note) => !note.tagsLoaded).map((note) => note.id);
  detailsFailed = false;

  async function worker(): Promise<void> {
    while (queue.length > 0 && version === loadVersion) {
      const id = queue.shift() as string;
      let loaded: Note | null = null;

      try {
        loaded = normalizeNote(await api.getNote(id));
      } catch (error) {
        if (error instanceof TypeError || (error instanceof ApiError && error.status === 401)) {
          detailsFailed = true;
          queue.length = 0;
          return;
        }
      }

      if (version !== loadVersion) {
        return;
      }

      const index = store.notes.findIndex((note) => note.id === id);
      if (index !== -1 && !store.notes[index].tagsLoaded) {
        store.notes[index] = loaded ?? { ...store.notes[index], tagsLoaded: true };
      }
      mounted?.onDetailsLoaded();
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < DETAILS_CONCURRENCY; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
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

/**
 * Кладёт заметку в локальный список: новую — в начало, существующую — на то же место.
 *
 * @param note Заметка в формате UI.
 */
function putNote(note: Note): void {
  const index = store.notes.findIndex((item) => item.id === note.id);
  if (index === -1) {
    store.notes.unshift(note);
  } else {
    store.notes[index] = note;
  }
}

/**
 * Готовит блок заметки к отрисовке в редакторе.
 *
 * @param block Блок из API.
 * @returns Данные блока для шаблона.
 */
function toBlockView(block: NoteBlock): BlockView {
  const isAttachment = block.content.type === "file" || block.content.type === "image";
  const url = safeResourceUrl(block.content.url ?? "");
  return {
    id: block.id,
    type: block.content.type,
    text: block.content.text,
    checked: block.content.checked === true,
    isChecklist: block.content.type === "checklist",
    isAttachment: isAttachment,
    isImage: block.content.type === "image",
    url: url,
    contentJson: isAttachment ? JSON.stringify(block.content) : "",
    isUploading: false,
    uploadError: isAttachment && !url ? "Файл не загружен" : "",
  };
}

/**
 * Собирает блоки редактора и добавляет пустой текстовый блок в конец, если его нет.
 *
 * @param note Заметка в формате UI.
 * @returns Блоки для редактора.
 */
function getEditorBlocks(note: Note): BlockView[] {
  const blocks: BlockView[] = [];

  for (const block of note.blocks) {
    const isAttachment = block.content.type === "file" || block.content.type === "image";
    if (isAttachment || !block.content.text.includes("\n")) {
      blocks.push(toBlockView(block));
      continue;
    }

    const lines = block.content.text.replaceAll("\r\n", "\n").replace(/\n$/, "").split("\n");
    for (let index = 0; index < lines.length; index++) {
      blocks.push(
        toBlockView({
          id: index === 0 ? block.id : "",
          content: { ...block.content, text: lines[index] },
        })
      );
    }
  }

  const last = blocks[blocks.length - 1];
  if (!last || last.isAttachment) {
    blocks.push(toBlockView({ id: "", content: { type: "text", text: "" } }));
  }

  return blocks;
}

/**
 * Создаёт пустую заметку, которой ещё нет на сервере.
 *
 * @returns Черновик с id `new`.
 */
function createDraft(): Note {
  return {
    id: "new",
    parentId: null,
    title: "",
    blocks: [],
    isLoaded: true,
    text: "",
    tags: [],
    tagsLoaded: true,
  };
}

/**
 * Открывает системный диалог выбора файла.
 *
 * @param accept Значение атрибута `accept`.
 * @returns Выбранный файл или `null`, если выбор отменён.
 */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/**
 * Формирует view-model для Handlebars-шаблонов страницы заметок.
 *
 * @param context Роут-контекст.
 * @param noteId Идентификатор заметки из маршрута или `new` для черновика.
 * @param saveStatus Состояние сохранения заметки.
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

  const isFiltering = activeTagIds.length > 0;
  const notes: Array<NoteLink & { isActive: boolean }> = [];
  if (noteId === "new") {
    notes.push({ href: "/notes/" + "new", title: "Без названия", isActive: true });
  }
  for (const note of store.notes) {
    if (isFiltering && !matchesTagFilter(note)) {
      continue;
    }
    notes.push({
      href: "/notes/" + note.id,
      title: note.title || "Без названия",
      isActive: note === currentNote,
    });
  }

  const filterTagViews: Array<TagView & { isActive: boolean }> = [];
  for (const tag of store.tags) {
    filterTagViews.push({ ...toTagView(tag), isActive: activeTagIds.includes(tag.id) });
  }

  let title = "";
  let displayTitle = "";
  let blocks: BlockView[] = [];
  let noteTags: TagView[] = [];
  const breadcrumbs = [{ href: "/notes", label: "Все заметки" }];

  if (currentNote) {
    title = currentNote.title;
    displayTitle = currentNote.title || "Без названия";
    blocks = getEditorBlocks(currentNote);
    noteTags = tagsByIds(
      currentNote.tags.map((tag) => tag.id),
      currentNote.tags
    ).map(toTagView);

    const parentNote = findNote(store.notes, currentNote.parentId);
    if (parentNote) {
      breadcrumbs.push({
        href: "/notes/" + parentNote.id,
        label: parentNote.title || "Без названия",
      });
    }
  }

  const profile = api.getCachedProfile();

  return {
    userLogin: getProfileLogin(profile),
    avatarUrl: api.avatarUrl(profile?.avatar ?? null),

    sectionTitle: currentSection.title,
    sections: sections,
    mailSection: { ...NOTIFICATIONS_SECTION, isActive: isActive(NOTIFICATIONS_SECTION) },

    isListLoading: isListLoading,
    isLoading: isListLoading || isNoteLoading,
    isError: isError,
    isConnectionLost: connectionLost,
    isEmpty: isReady && !hasNotes && !(noteId === "new"),
    isWelcome: isReady && hasNotes && !currentNote,
    skeletonRows: SKELETON_ROWS,

    notes: notes,
    filterTags: filterTagViews,
    tagsCollapsed: tagsCollapsed,
    hasActiveTags: isFiltering,
    isFilterEmpty: isFiltering && notes.length === 0,
    isFilterLoading: isFiltering && !detailsFailed && hasMissingDetails(),
    hasNote: hasNote,
    title: title,
    displayTitle: displayTitle,
    blocks: blocks,
    noteTags: noteTags,
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

  try {
    const [notes, tags] = await Promise.all([fetchAllNotes(), api.getTags().catch(() => null)]);

    if (version !== loadVersion) {
      return;
    }

    store.notes = notes;
    detailsFailed = false;
    if (tags) {
      store.tags = tags;
      activeTagIds = activeTagIds.filter((id) => tags.some((tag) => tag.id === id));
    }
    store.status = "ready";
  } catch (error) {
    if (version !== loadVersion) {
      return;
    }

    if (error instanceof ApiError && error.status === 401) {
      store.notes = [];
      store.status = "unauthorized";
      return;
    }

    connectionLost = error instanceof TypeError;
    store.status = store.notes.length > 0 ? "ready" : "error";
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
    connectionLost = false;
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

    const {
      page,
      listRegion,
      mainRegion,
      search,
      searchBox,
      searchResults,
      logoutDialog,
      deleteDialog,
      toast,
    } = elements;

    const destroyProfile = mountProfile(page, {
      notesCount: () => store.notes.length,
      onLogout: () => {
        logoutDialog.hidden = false;
      },
    });

    if (context.path === "/profile") {
      history.replaceState(null, "", "/notes");
    }

    const instance: NotesInstance = {
      page: page,
      search: search,
      searchBox: searchBox,
      searchTimer: undefined,
      mainRegion: mainRegion,
      noteId: context.params.id,
      saveStatus: "idle",
      saveTimer: undefined,
      saving: null,
      hasPendingChanges: false,
      toastTimer: undefined,
      deleting: false,
      onSearchInput: onSearchInput,
      onSearchFocusOut: onSearchFocusOut,
      renderSearchResults: renderSearchResults,
      onPageClick: onPageClick,
      onPageKeyDown: onPageKeyDown,
      finishSaving: finishSaving,
      onNoteInput: onNoteInput,
      onNoteChange: onNoteChange,
      onNoteKeyDown: onNoteKeyDown,
      onBeforeUnload: onBeforeUnload,
      onOnline: onOnline,
      onOffline: onOffline,
      onPaste: onPaste,
      onDragOver: onDragOver,
      onDrop: onDrop,
      onDragLeave: onDragLeave,
      onDetailsLoaded: onDetailsLoaded,
      listFrame: 0,
      destroyProfile: destroyProfile,
      destroyTags: () => undefined,
    };

    const tagsDialog = mountTagsDialog(page, {
      getTags: () => store.tags,
      onSaved: (tag) => {
        putTag(tag);
        refreshTags();
      },
      onDeleted: (id) => {
        const hadTag = getNoteTagIds().includes(id);
        removeTag(id);
        refreshTags();
        if (hadTag) {
          renderNoteTags(getNoteTagIds().filter((item) => item !== id));
          timerSave();
        }
      },
      onUnauthorized: goToLogin,
    });
    if (tagsDialog) {
      instance.destroyTags = tagsDialog.destroy;
    }

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

        if (error instanceof TypeError) {
          connectionLost = true;
          update();
          return;
        }

        store.status = "error";
        update();
      }
    }

    function update(): void {
      const view = buildView(context, instance.noteId, instance.saveStatus);
      listRegion.innerHTML = Handlebars.partials["notes-list"](view);
      mainRegion.innerHTML = Handlebars.partials["notes-main"](view);
    }

    /** Перерисовывает только список слева, не трогая открытый редактор. */
    function renderList(): void {
      const view = buildView(context, instance.noteId, instance.saveStatus);
      listRegion.innerHTML = Handlebars.partials["notes-list"](view);
    }

    function onDetailsLoaded(): void {
      if (instance.listFrame || mounted !== instance) {
        return;
      }
      instance.listFrame = window.requestAnimationFrame(() => {
        instance.listFrame = 0;
        renderList();
        renderSearchResults();
      });
    }

    function needsTagDetails(): boolean {
      const query = search.value.trim();
      const tagSearch = query !== "" && (query.startsWith("#") || filterTags(query).length > 0);
      return (activeTagIds.length > 0 || tagSearch) && hasMissingDetails();
    }

    function ensureTagDetails(): void {
      if (store.status === "ready" && !detailsFailed && needsTagDetails()) {
        void loadMissingDetails();
      }
    }

    function applyTagFilter(ids: string[]): void {
      activeTagIds = ids;
      renderList();
      ensureTagDetails();
    }

    function toggleTagFilter(id: string): void {
      const ids = activeTagIds.includes(id)
        ? activeTagIds.filter((item) => item !== id)
        : [...activeTagIds, id];
      applyTagFilter(ids);
    }

    function refreshTags(): void {
      renderList();
      if (mainRegion.querySelector("[data-note-tags]")) {
        renderNoteTags(getNoteTagIds());
      }
      renderPickerList();
    }

    function getNoteTagIds(): string[] {
      const ids: string[] = [];
      for (const chip of mainRegion.querySelectorAll<HTMLElement>("[data-note-tag]")) {
        if (chip.dataset.noteTag) {
          ids.push(chip.dataset.noteTag);
        }
      }
      return ids;
    }

    function renderNoteTags(ids: string[]): void {
      const list = mainRegion.querySelector<HTMLElement>("[data-note-tags]");
      if (!list) {
        return;
      }
      const fallback = findNote(store.notes, instance.noteId)?.tags ?? [];
      list.innerHTML = Handlebars.partials["note-tags"]({
        noteTags: tagsByIds(ids, fallback).map(toTagView),
      });
      setTagPickerExpanded(mainRegion.querySelector("[data-tag-picker]") !== null);
    }

    function setTagPickerExpanded(open: boolean): void {
      mainRegion
        .querySelector("[data-tag-picker-open]")
        ?.setAttribute("aria-expanded", String(open));
    }

    function tagPickerView(query: string) {
      const selected = getNoteTagIds();
      const key = query.trim().toLowerCase();
      const name = query.trim().slice(0, TAG_NAME_MAX_LENGTH);
      const tags = store.tags
        .filter((tag) => tag.name.toLowerCase().includes(key))
        .map((tag) => ({ ...toTagView(tag), isSelected: selected.includes(tag.id) }));
      return {
        tags: tags,
        hasQuery: key !== "",
        createName: name !== "" && !findTagByName(store.tags, name) ? name : "",
      };
    }

    function openTagPicker(): void {
      const root = mainRegion.querySelector<HTMLElement>("[data-note-tags-root]");
      if (!root) {
        return;
      }
      closeTagPicker();
      root.insertAdjacentHTML("beforeend", Handlebars.partials["tag-picker"](tagPickerView("")));
      setTagPickerExpanded(true);
      root.querySelector<HTMLInputElement>("[data-tag-picker-input]")?.focus();
    }

    function closeTagPicker(): void {
      mainRegion.querySelector("[data-tag-picker]")?.remove();
      setTagPickerExpanded(false);
    }

    function renderPickerList(): void {
      const picker = mainRegion.querySelector<HTMLElement>("[data-tag-picker]");
      const input = picker?.querySelector<HTMLInputElement>("[data-tag-picker-input]");
      const list = picker?.querySelector<HTMLElement>("[data-tag-picker-list]");
      if (!input || !list) {
        return;
      }
      list.innerHTML = Handlebars.partials["tag-picker-list"](tagPickerView(input.value));
    }

    function showTagPickerError(message: string): void {
      const error = mainRegion.querySelector<HTMLElement>("[data-tag-picker-error]");
      if (error) {
        error.textContent = message;
        error.hidden = message === "";
      }
    }

    function toggleNoteTag(id: string): void {
      const ids = getNoteTagIds();
      renderNoteTags(ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
      renderPickerList();
      mainRegion.querySelector<HTMLInputElement>("[data-tag-picker-input]")?.focus();
      timerSave();
    }

    let creatingTag = false;

    async function createTagFromPicker(name: string): Promise<void> {
      if (creatingTag) {
        return;
      }
      creatingTag = true;
      showTagPickerError("");

      try {
        const tag = await api.createTag({ name, color: nextTagColor(store.tags) });
        if (mounted !== instance) {
          return;
        }
        putTag(tag);
        renderNoteTags([...getNoteTagIds(), tag.id]);
        const input = mainRegion.querySelector<HTMLInputElement>("[data-tag-picker-input]");
        if (input) {
          input.value = "";
          input.focus();
        }
        renderPickerList();
        renderList();
        timerSave();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await goToLogin();
          return;
        }
        showTagPickerError(
          error instanceof ApiError ? error.message : "Не удалось связаться с сервером"
        );
      } finally {
        creatingTag = false;
      }
    }

    function onTagPickerKeyDown(event: KeyboardEvent, input: HTMLInputElement): void {
      if (event.key === "Escape") {
        event.preventDefault();
        closeTagPicker();
        mainRegion.querySelector<HTMLElement>("[data-tag-picker-open]")?.focus();
        return;
      }
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      const name = input.value.trim();
      if (name === "") {
        return;
      }
      const existing = findTagByName(store.tags, name);
      if (existing) {
        input.value = "";
        toggleNoteTag(existing.id);
        return;
      }
      void createTagFromPicker(name.slice(0, TAG_NAME_MAX_LENGTH));
    }

    function openTagsDialog(): void {
      closeTagPicker();
      searchResults.hidden = true;
      tagsDialog?.open();
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
      ensureTagDetails();
    }

    /**
     * Показывает под полем поиска заметки, в которых есть введенный текст.
     *
     * @returns {void}
     */
    function renderSearchResults(): void {
      const query = search.value.trim();
      const results: Array<NoteLink & { tags: TagView[] }> = [];
      let tags: TagView[] = [];

      if (query && store.status === "ready") {
        const found = filterNotes(store.notes, query).slice(0, SEARCH_RESULTS_LIMIT);

        for (const note of found) {
          results.push({
            href: "/notes/" + note.id,
            title: note.title || "Без названия",
            tags: note.tags.map(toTagView),
          });
        }

        tags = filterTags(query).slice(0, SEARCH_TAGS_LIMIT).map(toTagView);
        ensureTagDetails();
      }

      const canSearch = query !== "" && store.status === "ready";
      const isSearchActive = searchBox.contains(document.activeElement);

      searchResults.hidden = !canSearch || !isSearchActive;
      searchResults.innerHTML = canSearch
        ? Handlebars.partials["search-results"]({
            hasResults: results.length > 0,
            results: results,
            hasTags: tags.length > 0,
            tags: tags,
            isSearching: detailsRequest !== null,
          })
        : "";
    }

    function onSearchInput(): void {
      window.clearTimeout(instance.searchTimer);
      instance.searchTimer = window.setTimeout(renderSearchResults, SEARCH_DELAY);
    }

    /** Скрывает результаты поиска, если фокус ушёл за пределы блока `.search`. */
    function onSearchFocusOut(event: FocusEvent): void {
      const next = event.relatedTarget;
      if (next instanceof Node && searchBox.contains(next)) {
        return;
      }

      searchResults.hidden = true;
    }

    /** Закрывает модалку подтверждения выхода. */
    function closeLogoutDialog(): void {
      logoutDialog.hidden = true;
    }

    /** Вызывает API logout и переводит пользователя на страницу входа. */
    async function logOut(button: HTMLButtonElement): Promise<void> {
      button.disabled = true;
      await finishSaving();
      await api.logOut().catch(() => null);

      resetAuthState("unauthenticated");
      await navigate("/login");
    }

    function setNoteMenu(open: boolean): void {
      const button = mainRegion.querySelector<HTMLElement>("[data-note-menu-toggle]");
      const panel = mainRegion.querySelector<HTMLElement>("[data-note-menu-panel]");
      if (!button || !panel) {
        return;
      }
      panel.hidden = !open;
      button.classList.toggle("icon-button_active", open);
      button.setAttribute("aria-expanded", String(open));
    }

    function openDeleteDialog(): void {
      setNoteMenu(false);
      const error = deleteDialog.querySelector<HTMLElement>("[data-delete-error]");
      if (error) {
        error.hidden = true;
      }
      deleteDialog.hidden = false;
      deleteDialog.querySelector<HTMLElement>("[data-delete-cancel]")?.focus();
    }

    function closeDeleteDialog(): void {
      if (!instance.deleting) {
        deleteDialog.hidden = true;
      }
    }

    function setDeleting(deleting: boolean): void {
      instance.deleting = deleting;
      for (const button of deleteDialog.querySelectorAll<HTMLButtonElement>("button")) {
        button.disabled = deleting;
      }
      deleteDialog
        .querySelector("[data-delete]")
        ?.classList.toggle("modal__button_loading", deleting);
    }

    function showDeleteError(message: string): void {
      const error = deleteDialog.querySelector<HTMLElement>("[data-delete-error]");
      if (error) {
        error.textContent = message;
        error.hidden = false;
      }
    }

    async function deleteNote(): Promise<void> {
      if (instance.deleting) {
        return;
      }
      setDeleting(true);
      await finishSaving();
      if (mounted !== instance) {
        return;
      }

      const id = instance.noteId;
      try {
        if (id && id !== "new") {
          await api.deleteNote(id);
        }
      } catch (error) {
        if (mounted !== instance) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          await goToLogin();
          return;
        }
        if (!(error instanceof ApiError && error.status === 404)) {
          setDeleting(false);
          showDeleteError(
            error instanceof ApiError ? error.message : "Не удалось связаться с сервером"
          );
          return;
        }
      }

      window.clearTimeout(instance.saveTimer);
      instance.hasPendingChanges = false;

      const index = store.notes.findIndex((note) => note.id === id);
      let next: Note | undefined;
      if (index !== -1) {
        store.notes.splice(index, 1);
        next = store.notes[index] ?? store.notes[index - 1];
      }

      if (mounted !== instance) {
        return;
      }

      pendingToast = "Заметка удалена";
      history.replaceState(null, "", next ? "/notes/" + next.id : "/notes");
      await router();
    }

    function showToast(text: string): void {
      const label = toast.querySelector<HTMLElement>("[data-toast-text]");
      if (label) {
        label.textContent = text;
      }
      toast.hidden = false;
      window.clearTimeout(instance.toastTimer);
      instance.toastTimer = window.setTimeout(hideToast, TOAST_DELAY);
    }

    function hideToast(): void {
      toast.hidden = true;
    }

    function timerSave(): void {
      instance.hasPendingChanges = true;
      setSaveStatus("idle");
      window.clearTimeout(instance.saveTimer);
      instance.saveTimer = window.setTimeout(() => void runSave(), SAVE_DELAY);
    }

    async function saveNote(): Promise<void> {
      if (!instance.hasPendingChanges) {
        return;
      }

      window.clearTimeout(instance.saveTimer);
      instance.saveTimer = undefined;
      instance.hasPendingChanges = false;
      setSaveStatus("saving");

      const title = readTitle();
      const { elements, blocks, skipped } = collectBlocks();
      const tagIds = mainRegion.querySelector("[data-note-tags]") ? getNoteTagIds() : undefined;
      let failed = false;

      try {
        if (instance.noteId === "new") {
          if (title === "" && blocks.length === 0 && !tagIds?.length) {
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

        const saved = await api.updateNote(noteId, { title, blocks, tag_ids: tagIds });
        applyBlockIds(elements, saved.blocks ?? []);

        for (const element of skipped) {
          element.removeAttribute("data-block-id");
        }

        const previous = findNote(store.notes, noteId);
        const note = normalizeNote(saved);
        if (!Array.isArray(saved.tags)) {
          note.tags = tagIds ? tagsByIds(tagIds, previous?.tags ?? []) : (previous?.tags ?? []);
        }
        putNote(note);
        setSaveStatus("saved");
        if (activeTagIds.length > 0 && mounted === instance) {
          renderList();
        }
      } catch (error) {
        failed = true;
        instance.hasPendingChanges = true;

        if (error instanceof ApiError && error.status === 401) {
          if (mounted === instance) {
            await goToLogin();
          }
          return;
        }

        setSaveStatus("error");
      } finally {
        if (!failed && instance.hasPendingChanges && mounted === instance) {
          timerSave();
        }
      }
    }

    function runSave(): Promise<void> {
      if (!instance.saving) {
        instance.saving = saveNote().finally(() => {
          instance.saving = null;
        });
      }
      return instance.saving;
    }

    async function finishSaving(): Promise<void> {
      if (instance.saving) {
        await instance.saving;
      }
      window.clearTimeout(instance.saveTimer);
      if (instance.hasPendingChanges) {
        await runSave();
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

    /** Текст блока без хвостового переноса, который contenteditable добавляет сам. */
    function blockText(element: HTMLElement): string {
      const text = element.querySelector<HTMLElement>("[data-block-text]")?.innerText ?? "";
      return text.replaceAll("\r\n", "\n").replace(/\n$/, "");
    }

    /**
     * Раскладывает переносы внутри одного блока на отдельные блоки.
     * Иначе при следующем открытии contenteditable склеивает строки.
     */
    function expandNewlines(block: HTMLElement): void {
      const textElement = block.querySelector<HTMLElement>("[data-block-text]");
      if (!textElement) {
        return;
      }

      const text = blockText(block);
      if (!text.includes("\n")) {
        return;
      }

      const lines = text.split("\n");
      textElement.textContent = lines[0];
      const type = (block.dataset.blockType as BlockType) || "text";
      let previous = block;
      for (const line of lines.slice(1)) {
        const created = insertBlockAfter(previous, type);
        if (!created) {
          return;
        }
        created.textContent = line;
        previous = created.closest<HTMLElement>("[data-block]") ?? previous;
      }
    }

    function readBlock(element: HTMLElement): BlockContent | null {
      if (element.dataset.content) {
        try {
          return JSON.parse(element.dataset.content) as BlockContent;
        } catch {
          return null;
        }
      }

      const text = blockText(element);
      const check = element.querySelector<HTMLInputElement>("[data-block-check]");
      const content: BlockContent = { type: element.dataset.blockType as BlockType, text };
      if (check) {
        content.checked = check.checked;
      }
      return content;
    }

    function collectBlocks(): {
      elements: HTMLElement[];
      blocks: BlockInput[];
      skipped: HTMLElement[];
    } {
      const elements: HTMLElement[] = [];
      const blocks: BlockInput[] = [];
      const skipped: HTMLElement[] = [];
      const current = Array.from(mainRegion.querySelectorAll<HTMLElement>("[data-block]"));

      for (const element of current) {
        expandNewlines(element);
      }

      for (const element of mainRegion.querySelectorAll<HTMLElement>("[data-block]")) {
        const content = readBlock(element);
        if (!content) {
          skipped.push(element);
          continue;
        }

        const id = element.dataset.blockId;
        elements.push(element);
        blocks.push(id ? { id, content } : { content });
      }

      const last = blocks[blocks.length - 1];
      if (last && !last.id && last.content.text === "" && last.content.checked === undefined) {
        blocks.pop();
        elements.pop();
      }

      return { elements, blocks, skipped };
    }

    function openBlockMenu(block: HTMLElement): void {
      closeBlockMenu();
      block.insertAdjacentHTML(
        "beforeend",
        Handlebars.partials["block-menu"]({ options: BLOCK_OPTIONS })
      );
    }

    function closeBlockMenu(): void {
      mainRegion.querySelector("[data-block-menu]")?.remove();
    }

    function moveBlockMenu(menu: HTMLElement, step: number): void {
      const items = Array.from(menu.querySelectorAll<HTMLElement>("[data-block-option]"));
      const current = items.findIndex((item) => item.classList.contains("block-menu__item_active"));
      const next = items[(current + step + items.length) % items.length];
      items[current]?.classList.remove("block-menu__item_active");
      next.classList.add("block-menu__item_active");
      next.scrollIntoView({ block: "nearest" });
    }

    function chooseBlockType(block: HTMLElement, type: BlockType): void {
      closeBlockMenu();

      if (type === "file" || type === "image") {
        void attachFile(block, type);
        return;
      }

      const next = replaceBlock(
        block,
        toBlockView({ id: block.dataset.blockId ?? "", content: { type, text: "" } })
      );
      const text = next.querySelector<HTMLElement>("[data-block-text]");
      if (text) {
        placeCaret(text, false);
      }
      timerSave();
    }

    async function attachFile(block: HTMLElement, type: BlockType, given?: File): Promise<void> {
      const file = given ?? (await pickFile(type === "image" ? IMAGE_ACCEPT : FILE_ACCEPT));
      if (!file || !block.isConnected) {
        return;
      }

      const content: BlockContent = { type, text: file.name };
      const uploading = replaceBlock(block, {
        ...toBlockView({ id: block.dataset.blockId ?? "", content }),
        isUploading: true,
      });
      if (!uploading.nextElementSibling) {
        insertBlockAfter(uploading, "text");
      }
      const nextText =
        uploading.nextElementSibling?.querySelector<HTMLElement>("[data-block-text]");
      if (nextText && document.activeElement === document.body) {
        placeCaret(nextText, false);
      }

      timerSave();
      await finishSaving();
      if (mounted !== instance) {
        return;
      }

      const blockId = uploading.dataset.blockId ?? "";
      let uploadError = blockId ? "" : "Не удалось сохранить заметку";

      if (blockId) {
        try {
          const attachment = await api.uploadAttachment(blockId, file);
          content.attachmentId = attachment.id;
          content.url = attachment.url;
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            if (mounted === instance) {
              await goToLogin();
            }
            return;
          }
          uploadError =
            error instanceof ApiError ? error.message : "Не удалось связаться с сервером";
        }
      }

      if (!uploading.isConnected) {
        return;
      }

      const view = toBlockView({ id: blockId, content });
      replaceBlock(uploading, uploadError ? { ...view, uploadError } : view);
      timerSave();
    }

    async function attachFiles(block: HTMLElement, files: File[]): Promise<void> {
      closeBlockMenu();

      const slots: HTMLElement[] = [];
      let slot = block;
      for (let i = 0; i < files.length; i++) {
        if (i > 0 || readBlock(slot)) {
          insertBlockAfter(slot, "text");
          slot = slot.nextElementSibling as HTMLElement;
        }
        slots.push(slot);
      }

      const next = slot.nextElementSibling as HTMLElement | null;
      const nextText =
        next && !readBlock(next)
          ? next.querySelector<HTMLElement>("[data-block-text]")
          : insertBlockAfter(slot, "text");
      if (nextText) {
        placeCaret(nextText, false);
      }

      for (let i = 0; i < files.length; i++) {
        const type = files[i].type.startsWith("image/") ? "image" : "file";
        await attachFile(slots[i], type, files[i]);
      }
    }

    async function removeAttachment(block: HTMLElement): Promise<void> {
      const content = readBlock(block);
      block.remove();
      timerSave();

      if (content?.attachmentId) {
        await api.deleteAttachment(content.attachmentId).catch(() => null);
      }
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
        label.classList.toggle("notebook__save-status_error", status === "error");
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

    function placeCaret(element: HTMLElement, atEnd: boolean): void {
      element.focus();
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(!atEnd);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    function cutAfterCaret(text: HTMLElement): DocumentFragment | null {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return null;
      }

      const range = selection.getRangeAt(0);
      if (!text.contains(range.startContainer) || !text.contains(range.endContainer)) {
        return null;
      }

      range.deleteContents();
      const tail = document.createRange();
      tail.selectNodeContents(text);
      tail.setStart(range.startContainer, range.startOffset);
      return tail.extractContents();
    }

    function insertBlockAfter(block: HTMLElement, type: BlockType): HTMLElement | null {
      const view = toBlockView({ id: "", content: { type, text: "" } });
      block.insertAdjacentHTML("afterend", Handlebars.partials["note-block"](view));
      return block.nextElementSibling?.querySelector<HTMLElement>("[data-block-text]") ?? null;
    }

    function replaceBlock(block: HTMLElement, view: BlockView): HTMLElement {
      block.insertAdjacentHTML("afterend", Handlebars.partials["note-block"](view));
      const next = block.nextElementSibling as HTMLElement;
      block.remove();
      return next;
    }

    function onNoteKeyDown(event: KeyboardEvent): void {
      const target = event.target;
      if (event.isComposing || !(target instanceof HTMLElement)) {
        return;
      }

      if (target instanceof HTMLInputElement && target.matches("[data-tag-picker-input]")) {
        onTagPickerKeyDown(event, target);
        return;
      }

      const menu = mainRegion.querySelector<HTMLElement>("[data-block-menu]");
      if (menu && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        moveBlockMenu(menu, event.key === "ArrowDown" ? 1 : -1);
        return;
      }

      if (menu && event.key === "Enter") {
        event.preventDefault();
        const active = menu.querySelector<HTMLElement>(".block-menu__item_active");
        const block = menu.closest<HTMLElement>("[data-block]");
        if (active && block) {
          chooseBlockType(block, active.dataset.blockOption as BlockType);
        }
        return;
      }

      if (event.key === "Enter" && !event.shiftKey) {
        if (target.matches("[data-note-title]")) {
          event.preventDefault();
          const first = mainRegion.querySelector<HTMLElement>("[data-block-text]");
          if (first) {
            placeCaret(first, false);
          }
          return;
        }

        const block = target.closest<HTMLElement>("[data-block]");
        const text = block?.querySelector<HTMLElement>("[data-block-text]");
        if (!block || !text) {
          return;
        }

        event.preventDefault();
        const tail = cutAfterCaret(text);
        const type = block.dataset.blockType as BlockType;
        const next = insertBlockAfter(block, LIST_TYPES.includes(type) ? type : "text");
        if (next) {
          if (tail) {
            next.append(tail);
          }
          placeCaret(next, false);
        }
        timerSave();
        return;
      }

      if (event.key === "Backspace") {
        const block = target.closest<HTMLElement>("[data-block]");
        const text = block?.querySelector<HTMLElement>("[data-block-text]");
        const previous =
          block?.previousElementSibling?.querySelector<HTMLElement>("[data-block-text]");

        if (!block || !text || !previous || text.innerText.trim() !== "") {
          return;
        }

        event.preventDefault();
        block.remove();
        placeCaret(previous, true);
        timerSave();
      }
    }

    function onPageClick(event: MouseEvent): void {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (!target.closest("[data-note-menu]")) {
        setNoteMenu(false);
      }

      if (!target.closest("[data-block-menu]")) {
        closeBlockMenu();
      }

      if (!target.closest("[data-tag-picker], [data-tag-picker-open]")) {
        closeTagPicker();
      }

      if (target.closest("[data-tag-filter-toggle]")) {
        tagsCollapsed = !tagsCollapsed;
        renderList();
        listRegion.querySelector<HTMLElement>("[data-tag-filter-toggle]")?.focus();
        return;
      }

      if (target.closest("[data-tags-manage]")) {
        openTagsDialog();
        return;
      }

      const filterTag = target.closest<HTMLElement>("[data-tag-filter]");
      if (filterTag?.dataset.tagFilter) {
        toggleTagFilter(filterTag.dataset.tagFilter);
        return;
      }

      if (target.closest("[data-tag-filter-reset]")) {
        applyTagFilter([]);
        return;
      }

      const searchTag = target.closest<HTMLElement>("[data-search-tag]");
      if (searchTag?.dataset.searchTag) {
        window.clearTimeout(instance.searchTimer);
        search.value = "";
        searchResults.hidden = true;
        searchResults.innerHTML = "";
        applyTagFilter([searchTag.dataset.searchTag]);
        return;
      }

      if (target.closest("[data-tag-picker-open]")) {
        if (mainRegion.querySelector("[data-tag-picker]")) {
          closeTagPicker();
        } else {
          openTagPicker();
        }
        return;
      }

      const pickerTag = target.closest<HTMLElement>("[data-tag-picker-toggle]");
      if (pickerTag?.dataset.tagPickerToggle) {
        toggleNoteTag(pickerTag.dataset.tagPickerToggle);
        return;
      }

      if (target.closest("[data-tag-picker-create]")) {
        const input = mainRegion.querySelector<HTMLInputElement>("[data-tag-picker-input]");
        const name = input?.value.trim().slice(0, TAG_NAME_MAX_LENGTH) ?? "";
        if (name) {
          void createTagFromPicker(name);
        }
        return;
      }

      const removeTagButton = target.closest<HTMLElement>("[data-note-tag-remove]");
      if (removeTagButton?.dataset.noteTagRemove) {
        const id = removeTagButton.dataset.noteTagRemove;
        renderNoteTags(getNoteTagIds().filter((item) => item !== id));
        timerSave();
        return;
      }

      const option = target.closest<HTMLElement>("[data-block-option]");
      const optionBlock = option?.closest<HTMLElement>("[data-block]");
      if (option && optionBlock) {
        chooseBlockType(optionBlock, option.dataset.blockOption as BlockType);
        return;
      }

      const attachmentBlock = target
        .closest("[data-attachment-remove]")
        ?.closest<HTMLElement>("[data-block]");
      if (attachmentBlock) {
        void removeAttachment(attachmentBlock);
        return;
      }

      if (target.closest("[data-note-menu-toggle]")) {
        const panel = mainRegion.querySelector<HTMLElement>("[data-note-menu-panel]");
        setNoteMenu(panel?.hidden === true);
        return;
      }

      if (target.closest("[data-delete-open]")) {
        openDeleteDialog();
        return;
      }

      if (target.closest("[data-delete-cancel]") || target === deleteDialog) {
        closeDeleteDialog();
        return;
      }

      if (target.closest("[data-delete]")) {
        void deleteNote();
        return;
      }

      if (target.closest("[data-toast-close]")) {
        hideToast();
        return;
      }

      if (target.closest("[data-retry]")) {
        retryLoad();
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

    /** По Escape закрывает поиск, меню заметки, меню блоков и тегов, диалоги выхода и удаления. */
    function onPageKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") {
        return;
      }

      searchResults.hidden = true;
      closeLogoutDialog();
      setNoteMenu(false);
      closeDeleteDialog();
      closeBlockMenu();
      closeTagPicker();
    }

    function onNoteInput(event: Event): void {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.matches("[data-tag-picker-input]")) {
        showTagPickerError("");
        renderPickerList();
        return;
      }

      if (target.matches("[data-note-title]")) {
        showTitleInList(readTitle());
      }

      if (target.matches("[data-block-text]")) {
        const block = target.closest<HTMLElement>("[data-block]");
        if (block && target.innerText.trim() === "/") {
          openBlockMenu(block);
        } else {
          closeBlockMenu();
        }
      }

      if (target.closest("[data-note-title], [data-block-text]")) {
        if (target.textContent === "") {
          target.replaceChildren();
        }
        timerSave();
      }
    }

    function retryLoad(): void {
      connectionLost = false;
      store.status = "idle";
      update();
      void loadAndShow();
    }

    function onOffline(): void {
      showToast("Потеря соединения");
      window.clearTimeout(instance.toastTimer);
      toast.classList.add("toast_error");
    }

    function onOnline(): void {
      hideToast();
      toast.classList.remove("toast_error");

      if (instance.hasPendingChanges) {
        void runSave();
      }
      if (connectionLost) {
        retryLoad();
        return;
      }
      if (detailsFailed) {
        detailsFailed = false;
        ensureTagDetails();
      }
    }

    function findFileTarget(target: EventTarget | null): HTMLElement | null {
      const block = target instanceof Element ? target.closest<HTMLElement>("[data-block]") : null;
      const blocks = mainRegion.querySelectorAll<HTMLElement>("[data-block]");
      return block ?? blocks[blocks.length - 1] ?? null;
    }

    function onPaste(event: ClipboardEvent): void {
      const data = event.clipboardData;
      if (
        !data ||
        data.files.length === 0 ||
        data.getData("text/plain") !== "" ||
        event.target instanceof HTMLInputElement
      ) {
        return;
      }

      const block = findFileTarget(event.target);
      if (block) {
        event.preventDefault();
        void attachFiles(block, Array.from(data.files));
      }
    }

    function findDropTarget(event: DragEvent): HTMLElement | null {
      const inNote = event.target instanceof Node && mainRegion.contains(event.target);
      return inNote ? findFileTarget(event.target) : null;
    }

    function onDragOver(event: DragEvent): void {
      if (event.dataTransfer?.types.includes("Files")) {
        event.preventDefault();
        const target = findDropTarget(event);
        event.dataTransfer.dropEffect = target ? "copy" : "none";
        mainRegion.querySelector(".notebook")?.classList.toggle("notebook_drop", target !== null);
      }
    }

    function onDragLeave(event: DragEvent): void {
      if (!event.relatedTarget) {
        mainRegion.querySelector(".notebook")?.classList.toggle("notebook_drop", false);
      }
    }

    function onDrop(event: DragEvent): void {
      if (!event.dataTransfer?.types.includes("Files")) {
        return;
      }

      event.preventDefault();
      mainRegion.querySelector(".notebook")?.classList.toggle("notebook_drop", false);
      const block = findDropTarget(event);
      if (block) {
        void attachFiles(block, Array.from(event.dataTransfer.files));
      }
    }

    function onNoteChange(event: Event): void {
      if (event.target instanceof HTMLInputElement && event.target.matches("[data-block-check]")) {
        timerSave();
      }
    }

    function onBeforeUnload(event: BeforeUnloadEvent): void {
      if (instance.hasPendingChanges || instance.saving) {
        event.preventDefault();
      }
    }

    search.addEventListener("input", onSearchInput);
    search.addEventListener("focus", renderSearchResults);
    searchBox.addEventListener("focusout", onSearchFocusOut);
    page.addEventListener("click", onPageClick);
    page.addEventListener("keydown", onPageKeyDown);
    mainRegion.addEventListener("input", onNoteInput);
    mainRegion.addEventListener("change", onNoteChange);
    mainRegion.addEventListener("keydown", onNoteKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragleave", onDragLeave);

    mounted = instance;

    if (pendingToast) {
      showToast(pendingToast);
      pendingToast = "";
    }

    if (!navigator.onLine) {
      onOffline();
    }

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
  async destroy(): Promise<void> {
    const leaving = mounted;
    if (!leaving) {
      return;
    }
    mounted = null;

    window.clearTimeout(leaving.searchTimer);
    window.clearTimeout(leaving.toastTimer);
    leaving.search.removeEventListener("input", leaving.onSearchInput);
    leaving.search.removeEventListener("focus", leaving.renderSearchResults);
    leaving.searchBox.removeEventListener("focusout", leaving.onSearchFocusOut);
    leaving.page.removeEventListener("click", leaving.onPageClick);
    leaving.page.removeEventListener("keydown", leaving.onPageKeyDown);
    leaving.mainRegion.removeEventListener("input", leaving.onNoteInput);
    leaving.mainRegion.removeEventListener("change", leaving.onNoteChange);
    leaving.mainRegion.removeEventListener("keydown", leaving.onNoteKeyDown);
    window.removeEventListener("beforeunload", leaving.onBeforeUnload);
    window.removeEventListener("online", leaving.onOnline);
    window.removeEventListener("offline", leaving.onOffline);
    window.removeEventListener("paste", leaving.onPaste);
    window.removeEventListener("dragover", leaving.onDragOver);
    window.removeEventListener("drop", leaving.onDrop);
    window.removeEventListener("dragleave", leaving.onDragLeave);
    window.cancelAnimationFrame(leaving.listFrame);
    leaving.destroyProfile();
    leaving.destroyTags();

    await leaving.finishSaving();
  }
}
