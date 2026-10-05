import { api } from "../api.js";
import { router, navigate, resetAuthState } from "../router.js";

const SECTIONS = [
  { href: "/notes", icon: "file", title: "Все заметки" },
  { href: "/notes/favourites", icon: "heart", title: "Избранное" },
  { href: "/notes/trash", icon: "trash", title: "Корзина" },
];

const NOTIFICATIONS_SECTION = { href: "/notes/notifications", icon: "bell", title: "Уведомления" };

const ALL_SECTIONS = [...SECTIONS, NOTIFICATIONS_SECTION];

const NOTES_LIMIT = 100;
const SEARCH_DELAY = 200;
const SKELETON_ROWS = [1, 2, 3, 4, 5, 6];

const store = {
  status: "idle",
  notes: [],
  error: "",
};

let notesRequest = null;
let mounted = null;
let loadVersion = 0;

/**
 * Сбрасывает локальное состояние notes-страницы.
 * Используется при logout и смене пользователя.
 *
 * @returns {void}
 */
export function resetNotesStore() {
  loadVersion++;
  store.status = "idle";
  store.notes = [];
  store.error = "";
  notesRequest = null;
}

/**
 * Извлекает текстовые блоки заметки в массив абзацев.
 *
 * @param {{ blocks?: Array<{ content?: string }> }} note Исходная заметка из API.
 * @returns {string[]}
 */
function getParagraphs(note) {
  const paragraphs = [];

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
 * @param {{ id: string|number, title?: string, parent_note_id?: string|number|null, blocks?: Array<{ content?: string }> }} note
 * @returns {{ id: string, parentId: string | null, title: string, paragraphs: string[], text: string }}
 */
function normalizeNote(note) {
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
 * @returns {Promise<Array<{ id: string, parentId: string | null, title: string, paragraphs: string[], text: string }>>}
 */
async function fetchAllNotes() {
  const notes = [];
  let offset = 0;

  while (true) {
    const response = await api.getNotes(NOTES_LIMIT, offset);
    const list = Array.isArray(response) ? response : [];

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
 * @param {string} path Текущий pathname.
 * @returns {{ href: string, icon: string, title: string }}
 */
function getCurrentSection(path) {
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
 * @param {Array<{ title: string, text: string }>} notes Список заметок.
 * @param {string} query Поисковая строка.
 * @returns {Array<{ title: string, text: string }>}
 */
function filterNotes(notes, query) {
  const search = query.trim().toLowerCase();

  if (search === "") {
    return notes;
  }

  const result = [];
  for (const note of notes) {
    const noteText = (note.title + " " + note.text).toLowerCase();
    if (noteText.includes(search)) {
      result.push(note);
    }
  }
  return result;
}

/**
 * Считывает строку поиска из URL-параметра `q`.
 *
 * @returns {string}
 */
function getQueryFromUrl() {
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

/**
 * Синхронизирует строку поиска с URL без перезагрузки страницы.
 *
 * @param {string} query Поисковый запрос.
 * @returns {void}
 */
function setQueryToUrl(query) {
  const url = new URL(window.location.href);
  if (query) {
    url.searchParams.set("q", query);
  } else {
    url.searchParams.delete("q");
  }
  history.replaceState(null, "", url);
}

/**
 * Ищет заметку по id в коллекции.
 *
 * @param {Array<{ id: string }>} notes Коллекция заметок.
 * @param {string | undefined} id Идентификатор заметки из route params.
 * @returns {{ id: string } | null}
 */
function findNote(notes, id) {
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
 * @param {{ path: string, params: Record<string, string> }} context Роут-контекст.
 * @returns {Record<string, unknown>}
 */
function buildView(context) {
  const path = context.path;
  const params = context.params;
  const query = getQueryFromUrl();

  const currentSection = getCurrentSection(path);
  const foundNotes = filterNotes(store.notes, query);
  const currentNote = findNote(store.notes, params.id);

  const isReady = store.status === "ready";
  const isError = store.status === "error";
  const isLoading = !isReady && !isError;
  const hasNotes = store.notes.length > 0;

  function isActive(section) {
    return section === currentSection;
  }

  const sections = [];
  for (const section of SECTIONS) {
    sections.push({ ...section, isActive: isActive(section) });
  }

  const notes = [];
  for (const note of foundNotes) {
    notes.push({
      href: "/notes/" + note.id,
      title: note.title,
      isActive: note === currentNote,
    });
  }

  let title = "";
  let paragraphs = [];
  const breadcrumbs = [{ href: "/notes", label: "Все заметки" }];

  if (currentNote) {
    title = currentNote.title;
    paragraphs = currentNote.paragraphs;

    const parentNote = findNote(store.notes, currentNote.parentId);
    if (parentNote) {
      breadcrumbs.push({ href: "/notes/" + parentNote.id, label: parentNote.title });
    }
  }

  const profile = api.getCachedProfile();
  const userLogin = profile?.login ?? profile?.username ?? profile?.name ?? "";

  return {
    query: query,
    userLogin: userLogin,

    sectionTitle: currentSection.title,
    sections: sections,
    mailSection: { ...NOTIFICATIONS_SECTION, isActive: isActive(NOTIFICATIONS_SECTION) },

    isLoading: isLoading,
    isError: isError,
    errorMessage: store.error,
    isEmpty: isReady && !hasNotes,
    isNotFound: !isLoading && hasNotes && foundNotes.length === 0,
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
async function loadNotes() {
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

    if (error.status === 401) {
      store.status = "unauthorized";
      return;
    }

    store.status = "error";
    store.error = error.status ? error.message : "Не удалось связаться с сервером";
  }
}

/**
 * Возвращает текущий запрос заметок или запускает новый.
 *
 * @returns {Promise<void>}
 */
function waitForNotes() {
  if (store.status !== "loading") {
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
   * @param {{ path: string, params: Record<string, string> }} context Роут-контекст.
   * @returns {Promise<string>}
   */
  async render(context) {
    const template = Handlebars.templates["notes"];
    const view = buildView(context);
    return template(view);
  },

  /**
   * Монтирует обработчики страницы и запускает начальную загрузку данных.
   *
   * @param {ParentNode} root Корневой узел текущей страницы.
   * @param {{ path: string, params: Record<string, string> }} context Роут-контекст.
   * @returns {Promise<void>}
   */
  async mount(root, context) {
    const page = root.querySelector(".notes-page");
    const listRegion = page.querySelector("[data-notes-list]");
    const mainRegion = page.querySelector("[data-notes-main]");
    const search = page.querySelector("[data-search]");

    const instance = {
      page: page,
      search: search,
      searchTimer: null,
      onSearchInput: onSearchInput,
      onPageClick: onPageClick,
    };

    function update() {
      const view = buildView(context);
      listRegion.innerHTML = Handlebars.partials["notes-list"](view);
      mainRegion.innerHTML = Handlebars.partials["notes-main"](view);
    }

    async function loadAndShow() {
      await waitForNotes();

      if (mounted !== instance) {
        return;
      }

      if (store.status === "unauthorized") {
        resetAuthState("unauthenticated");
        history.replaceState(null, "", "/login");
        router();
        return;
      }

      update();
    }

    function runSearch() {
      instance.searchTimer = null;
      setQueryToUrl(search.value.trim());
      update();
    }

    function onSearchInput() {
      clearTimeout(instance.searchTimer);
      instance.searchTimer = setTimeout(runSearch, SEARCH_DELAY);
    }

    async function onPageClick(event) {
      if (event.target.closest("[data-retry]")) {
        store.status = "idle";
        update();
        loadAndShow();
        return;
      }

      const clearButton = event.target.closest("[data-search-clear]");

      if (clearButton) {
        clearTimeout(instance.searchTimer);
        instance.searchTimer = null;
        search.value = "";
        setQueryToUrl("");
        update();
        search.focus();
        return;
      }

      const logoutButton = event.target.closest("[data-logout]");
      if (!logoutButton) {
        return;
      }

      logoutButton.disabled = true;
      try {
        await api.logOut();
      } finally {
        setQueryToUrl("");
        resetAuthState("unauthenticated");
        await navigate("/login");
      }
    }

    search.addEventListener("input", onSearchInput);
    page.addEventListener("click", onPageClick);

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
  destroy() {
    if (!mounted) {
      return;
    }

    clearTimeout(mounted.searchTimer);
    mounted.search.removeEventListener("input", mounted.onSearchInput);
    mounted.page.removeEventListener("click", mounted.onPageClick);
    mounted = null;
  },
};
