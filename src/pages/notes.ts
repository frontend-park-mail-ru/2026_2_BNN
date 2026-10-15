import { api } from "../api";
import { router, navigate, resetAuthState } from "../router";

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

interface PageContext {
  path: string;
  params: Record<string, string>;
}

interface Note {
  id: string;
  parentId: string | null;
  title: string;
  paragraphs: string[];
  text: string;
}

interface NoteLink {
  href: string;
  title: string;
}

interface ApiBlock {
  content: string;
}

interface ApiNote {
  id: string;
  parent_note_id?: string | null;
  title: string;
  blocks: ApiBlock[];
}

interface ApiErrorLike {
  status: number;
  message: string;
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
  onSearchInput: () => void;
  onSearchFocus: () => void;
  onSearchFocusOut: (event: FocusEvent) => void;
  onPageClick: (event: MouseEvent) => void;
  onPageKeyDown: (event: KeyboardEvent) => void;
}

const store: NotesStore = { status: "idle", notes: [], error: "" };

let notesRequest: Promise<void> | null = null;
let mounted: NotesInstance | null = null;
let loadVersion = 0;

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
 * Проверяет, что ошибка пришла от API и содержит HTTP-статус.
 *
 * @param error Перехваченная ошибка.
 * @returns `true`, если у ошибки есть числовой `status`.
 */
function isApiError(error: unknown): error is ApiErrorLike {
  return error instanceof Error && "status" in error && typeof error.status === "number";
}

/**
 * Достаёт логин из профиля, который роутер закэшировал в api.
 *
 * @param profile Профиль текущего пользователя или `null`.
 * @returns Логин или пустая строка, если профиля нет.
 */
function getProfileLogin(profile: unknown): string {
  if (
    typeof profile === "object" &&
    profile !== null &&
    "login" in profile &&
    typeof profile.login === "string"
  ) {
    return profile.login;
  }
  return "";
}

/**
 * Находит на отрисованной странице все элементы, с которыми работает mount.
 *
 * @param root Корневой узел текущей страницы.
 * @returns Элементы страницы или `null`, если чего-то не хватает в разметке.
 */
function getNotesElements(root: ParentNode): NotesElements | null {
  const page = root.querySelector<HTMLElement>(".notes-page");
  if (!page) {
    return null;
  }

  const listRegion = page.querySelector<HTMLElement>("[data-notes-list]");
  const mainRegion = page.querySelector<HTMLElement>("[data-notes-main]");
  const search = page.querySelector<HTMLInputElement>("[data-search]");
  const searchBox = page.querySelector<HTMLElement>(".search-box");
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
function getParagraphs(note: ApiNote): string[] {
  const paragraphs: string[] = [];

  if (!Array.isArray(note.blocks)) {
    return paragraphs;
  }

  for (const block of note.blocks) {
    if (block.content) {
      paragraphs.push(block.content);
    }
  }
  return paragraphs;
}

/**
 * Приводит заметку API к формату, удобному для UI.
 *
 * @param note Исходная заметка из API.
 * @returns Заметка для шаблонов и поиска.
 */
function normalizeNote(note: ApiNote): Note {
  const title = note.title || "Без названия";
  const parentId = note.parent_note_id ? String(note.parent_note_id) : null;
  const paragraphs = getParagraphs(note);

  return {
    id: String(note.id),
    parentId: parentId,
    title: title,
    paragraphs: paragraphs,
    text: paragraphs.join(" "),
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
    const response = await api.getNotes(NOTES_LIMIT, offset);
    const list: ApiNote[] = Array.isArray(response) ? response : [];

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

/**
 * Формирует view-model для Handlebars-шаблонов страницы заметок.
 *
 * @param context Роут-контекст.
 * @returns Данные для шаблонов `notes`, `notes-list` и `notes-main`.
 */
function buildView(context: PageContext) {
  const path = context.path;
  const params = context.params;

  const currentSection = getCurrentSection(path);
  const currentNote = findNote(store.notes, params.id);

  const isReady = store.status === "ready";
  const isError = store.status === "error";
  const isLoading = !isReady && !isError;
  const hasNotes = store.notes.length > 0;

  function isActive(section: Section): boolean {
    return section === currentSection;
  }

  const sections: Array<Section & { isActive: boolean }> = [];
  for (const section of SECTIONS) {
    sections.push({ ...section, isActive: isActive(section) });
  }

  const notes: Array<NoteLink & { isActive: boolean }> = [];
  for (const note of store.notes) {
    notes.push({
      href: "/notes/" + note.id,
      title: note.title,
      isActive: note === currentNote,
    });
  }

  let title = "";
  let paragraphs: string[] = [];
  const breadcrumbs = [{ href: "/notes", label: "Все заметки" }];

  if (currentNote) {
    title = currentNote.title;
    paragraphs = currentNote.paragraphs;

    const parentNote = findNote(store.notes, currentNote.parentId);
    if (parentNote) {
      breadcrumbs.push({ href: "/notes/" + parentNote.id, label: parentNote.title });
    }
  }

  return {
    userLogin: getProfileLogin(api.getCachedProfile()),

    sectionTitle: currentSection.title,
    sections: sections,
    mailSection: { ...NOTIFICATIONS_SECTION, isActive: isActive(NOTIFICATIONS_SECTION) },

    isLoading: isLoading,
    isError: isError,
    errorMessage: store.error,
    isEmpty: isReady && !hasNotes,
    isWelcome: isReady && hasNotes && !currentNote,
    skeletonRows: SKELETON_ROWS,

    notes: notes,
    title: title,
    paragraphs: paragraphs,
    breadcrumbs: breadcrumbs,
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

    if (isApiError(error) && error.status === 401) {
      store.status = "unauthorized";
      return;
    }

    store.status = "error";
    store.error = isApiError(error) ? error.message : "Не удалось связаться с сервером";
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
export const NotesPage = {
  /**
   * Рендерит полный шаблон страницы заметок.
   *
   * @param context Роут-контекст.
   * @returns {Promise<string>}
   */
  async render(context: PageContext): Promise<string> {
    const template = Handlebars.templates["notes"];
    const view = buildView(context);
    return template(view);
  },

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
      onSearchInput: onSearchInput,
      onSearchFocus: onSearchFocus,
      onSearchFocusOut: onSearchFocusOut,
      onPageClick: onPageClick,
      onPageKeyDown: onPageKeyDown,
    };

    function update(): void {
      const view = buildView(context);
      listRegion.innerHTML = Handlebars.partials["notes-list"](view);
      mainRegion.innerHTML = Handlebars.partials["notes-main"](view);
    }

    async function loadAndShow(): Promise<void> {
      await waitForNotes();

      if (mounted !== instance) {
        return;
      }

      if (store.status === "unauthorized") {
        resetAuthState("unauthenticated");
        history.replaceState(null, "", "/login");
        await router();
        return;
      }

      update();
      renderSearchResults();
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

      const logoutButton = target.closest<HTMLButtonElement>("[data-logout]");
      if (logoutButton) {
        void logOut(logoutButton);
      }
    }

    function onPageKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") {
        return;
      }

      searchResults.hidden = true;
      closeLogoutDialog();
    }

    search.addEventListener("input", onSearchInput);
    search.addEventListener("focus", onSearchFocus);
    searchBox.addEventListener("focusout", onSearchFocusOut);
    page.addEventListener("click", onPageClick);
    page.addEventListener("keydown", onPageKeyDown);

    mounted = instance;

    if (store.status === "ready") {
      return;
    }

    await loadAndShow();
  },

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
    mounted = null;
  },
};
