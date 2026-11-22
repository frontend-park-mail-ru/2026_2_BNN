import { api } from "@/api";
import { getThemeIcon, themeAsset } from "@/components/theme/theme";
import { toTagView, type TagView } from "@/domain/tags";
import { authStore } from "@/flux/auth/auth-store";
import { notesStore } from "@/flux/notes/note-store";
import type { NoteStateItem as Note } from "@/flux/notes/note-action-types";
import type { ReadonlyState } from "@/flux/base-store";
import type { User } from "@/types/user";
import type { PageContext } from "@/router";
import { getEditorBlocks, type BlockView } from "@/pages/notes/editor/block-view";
import { SAVE_STATUS } from "@/pages/notes/editor/constants";
import { isSpeechSupported } from "@/pages/notes/voice-input/speech";
import { matchesTagFilter } from "@/pages/notes/tag-filter";
import { getTags, getActiveTagIds, findNote, tagsByIds } from "@/pages/notes/selectors";
import { buildNoteTree, filterNoteTree } from "@/pages/notes/note-tree";

const WELCOME_TITLE = "добро пожаловать";

/** Пункт боковой панели: адрес, иконка и название раздела. */
interface Section {
  enabled: boolean;
  href: string;
  icon: string;
  title: string;
}

export function isFavoritesPath(path: string): boolean {
  return path === "/notes/favorites" || path.startsWith("/notes/favorites/");
}

const SECTIONS: Section[] = [
  { href: "/notes/all", icon: "file", title: "Все заметки", enabled: true },
  { href: "/notes/favorites", icon: "heart", title: "Избранное", enabled: true },
  { href: "/notes/trash", icon: "trash", title: "Корзина", enabled: false },
];

const NOTIFICATIONS_SECTION: Section = {
  enabled: false,
  href: "/notes/notifications",
  icon: "bell",
  title: "Уведомления",
};

const ALL_SECTIONS: Section[] = [...SECTIONS, NOTIFICATIONS_SECTION];

const SKELETON_ROWS = [1, 2, 3, 4, 5, 6];

/**
 * Достаёт логин текущего пользователя для шаблона.
 *
 * @param profile Профиль текущего пользователя или `null`.
 * @returns Логин или пустая строка, если профиля нет.
 */
function getProfileLogin(profile: User | null): string {
  return profile?.login ?? "";
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

/** Заметка, которую показываем сразу после входа, если маршрут без id. */
function welcomeNote(): ReadonlyState<Note> | undefined {
  return (
    notesStore.getState().notes.find((note) => note.title.trim().toLowerCase() === WELCOME_TITLE) ??
    notesStore.getState().notes[0]
  );
}

/**
 * Маршруты без id заметки: с них открываем приветственную.
 *
 * @param path Текущий путь.
 * @returns `true` для `/`, `/notes` и `/profile`.
 */
function isNotesHome(path: string): boolean {
  return path === "/" || path === "/notes" || path === "/profile";
}

/**
 * На `/notes` без id открывает приветственную заметку.
 * Пока список не загружен, id не подставляем: сначала виден скелет.
 */
export function noteIdFor(context: PageContext): string | undefined {
  if (context.params.id) {
    return context.params.id;
  }
  if (
    !isNotesHome(context.path) ||
    notesStore.getState().status !== "ready" ||
    getActiveTagIds().length > 0
  ) {
    return undefined;
  }
  return welcomeNote()?.id;
}

/**
 * Формирует view-model для Handlebars-шаблонов страницы заметок.
 *
 * @param context Роут-контекст.
 * @param noteId Идентификатор заметки из маршрута или `new` для черновика.
 * @param tagsCollapsed Свёрнут ли список тегов в боковой панели.
 * @returns Данные для шаблонов `notes`, `notes-list` и `notes-main`.
 */
export function buildNotesView(
  context: PageContext,
  noteId: string | undefined,
  tagsCollapsed = false
) {
  const isFavorites = isFavoritesPath(context.path);
  const currentSection = getCurrentSection(isFavorites ? "/notes/favorites" : context.path);
  const state = notesStore.getState();
  const currentNote = noteId === "new" ? createDraft() : findNote(state.notes, noteId);

  const isReady = state.status === "ready";
  const noteLoad = noteId ? state.noteLoads[noteId] : undefined;
  const isFavoritesError = isFavorites && state.favoritesStatus === "error";
  const isListError = state.status === "error" || isFavoritesError;
  const isNoteError = noteLoad?.status === "error";
  const isListLoading =
    !isListError && (!isReady || (isFavorites && state.favoritesStatus !== "ready"));
  const isNoteLoading =
    !!noteId && noteId !== "new" && !currentNote?.isLoaded && noteLoad?.status !== "error";
  const hasNotes = state.notes.length > 0;
  const hasNote = currentNote !== null && currentNote.isLoaded;
  const isMainError =
    isNoteError || (state.status === "error" && !hasNote) || (isFavoritesError && !noteId);

  /**
   * Совпадает ли пункт сайдбара с открытым разделом.
   *
   * @param section Пункт из `SECTIONS`.
   * @returns `true`, если это текущий раздел.
   */
  function isActive(section: Section): boolean {
    return section === currentSection;
  }

  const sections: Array<Section & { isActive: boolean }> = [];
  for (const section of SECTIONS) {
    sections.push({ ...section, isActive: isActive(section) });
  }

  const activeTagIds = getActiveTagIds();
  const isFiltering = activeTagIds.length > 0;
  const visibleNotes = state.notes.filter(
    (note) => !isFiltering || matchesTagFilter(note.tags, activeTagIds)
  );

  const favoriteIds = isFavorites ? new Set(state.favoriteIds) : null;
  const missingFilterTags =
    isFiltering &&
    state.notes.some((note) => !note.tagsLoaded && (!favoriteIds || favoriteIds.has(note.id)));
  const notes = favoriteIds
    ? filterNoteTree(
        buildNoteTree(state.notes, noteId, "/notes/favorites"),
        new Set(visibleNotes.filter((note) => favoriteIds.has(note.id)).map((note) => note.id))
      )
    : buildNoteTree(noteId === "new" ? [createDraft(), ...visibleNotes] : visibleNotes, noteId);

  const filterTagViews: Array<TagView & { isActive: boolean }> = [];
  for (const tag of getTags()) {
    filterTagViews.push({ ...toTagView(tag), isActive: activeTagIds.includes(tag.id) });
  }

  let title = "";
  let displayTitle = "";
  let blocks: BlockView[] = [];
  let noteTags: TagView[] = [];
  const breadcrumbs = [{ href: "/notes/all", label: "Все заметки" }];

  if (currentNote) {
    title = currentNote.title;
    displayTitle = currentNote.title || "Без названия";
    blocks = getEditorBlocks(currentNote);
    noteTags = tagsByIds(
      currentNote.tags.map((tag) => tag.id),
      currentNote.tags
    ).map(toTagView);

    const ancestors: Array<{ href: string; label: string }> = [];
    const visited = new Set<string>([currentNote.id]);
    let parentId = currentNote.parentId;

    while (parentId && !visited.has(parentId)) {
      const parent = findNote(state.notes, parentId);
      if (!parent) break;

      visited.add(parent.id);
      ancestors.push({
        href: `/notes/${encodeURIComponent(parent.id)}`,
        label: parent.title || "Без названия",
      });
      parentId = parent.parentId;
    }

    breadcrumbs.push(...ancestors.reverse());
  }

  const profile = authStore.getState().user;

  return {
    themeIcon: getThemeIcon(),
    logoSrc: themeAsset("logo"),
    userLogin: getProfileLogin(profile),
    avatarUrl: api.avatarUrl(profile?.avatar ?? null) || themeAsset("avatar"),

    sectionTitle: currentSection.title,
    isFavoritesOverview: isFavorites && !noteId,
    isListError,
    hasFavorites: state.favoriteIds.length > 0,
    sections: sections,
    mailSection: { ...NOTIFICATIONS_SECTION, isActive: isActive(NOTIFICATIONS_SECTION) },

    isListLoading,
    isNoteError,
    isMainError,
    isLoading: !isMainError && ((!noteId && isListLoading) || !isReady || isNoteLoading),
    isConnectionLost: !hasNote && (state.loadError === "offline" || noteLoad?.error === "offline"),
    isEmpty: isReady && !hasNotes && !(noteId === "new"),
    isWelcome: isReady && hasNotes && !currentNote,
    skeletonRows: SKELETON_ROWS,

    notes: notes,
    filterTags: filterTagViews,
    tagsCollapsed: tagsCollapsed,
    hasActiveTags: isFiltering,
    isFilterEmpty: isFiltering && notes.length === 0,
    isFilterLoading: missingFilterTags && state.detailsStatus !== "error",
    isFilterIncomplete: missingFilterTags && state.detailsStatus === "error",
    hasNote: hasNote,
    canUseVoiceInput: isSpeechSupported(),
    title: title,
    displayTitle: displayTitle,
    blocks: blocks,
    noteTags: noteTags,
    breadcrumbs,
    hasAncestors: breadcrumbs.length > 1,
    isAllNotes: context.path === "/notes/all",
    saveStatus: SAVE_STATUS[state.saveStatus],
  };
}
