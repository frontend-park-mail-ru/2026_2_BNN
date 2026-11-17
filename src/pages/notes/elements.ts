/** Узлы страницы заметок, без которых монтировать её нельзя. */
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

/**
 * Находит на отрисованной странице все элементы, с которыми работает mount.
 *
 * @param root Корневой узел текущей страницы.
 * @returns Элементы страницы или `null`, если чего-то не хватает в разметке.
 */
export function getNotesElements(root: ParentNode): NotesElements | null {
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
