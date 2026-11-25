import { ApiError } from "@/api";
import * as authActions from "@/flux/auth/auth-actions";
import { authStore } from "@/flux/auth/auth-store";
import type { ReadonlyState } from "@/flux/base-store";
import type { NoteStateItem as Note } from "@/flux/notes/note-action-types";
import * as noteActions from "@/flux/notes/note-actions";
import { notesStore } from "@/flux/notes/note-store";
import * as tagActions from "@/flux/tags/tag-actions";
import * as uiActions from "@/flux/ui/ui-actions";
import { uiStore } from "@/flux/ui/ui-store";
import { router, navigate, type PageContext } from "@/router";
import { createNoteEditor, type NoteEditor } from "@/pages/notes/editor/controller";
import { getNotesElements } from "@/pages/notes/elements";
import { mountMobileSidebar } from "@/pages/notes/mobile-sidebar";
import { buildNotesView, isFavoritesPath, noteIdFor } from "@/pages/notes/view";
import { getNote } from "@/pages/notes/selectors";
import { mountNotesList } from "@/pages/notes/list";
import { mountNotesSearch } from "@/pages/notes/search-controller";
import { createTagPicker } from "@/pages/notes/tag-picker";
import { mountProfile } from "@/pages/profile";

/** Смонтированная страница заметок. Нужна, чтобы отличать устаревший ответ от текущего экрана. */
interface NotesInstance {
  path: string;
  editor: NoteEditor;
  noteId: string | undefined;
  deleting: boolean;
  finishEditing: () => Promise<boolean>;
  dispose: () => void;
  isDeletingChild: () => boolean;
  updateRoute: (context: PageContext) => boolean;
}

let mounted: NotesInstance | null = null;
let pendingFocusNoteId: string | null = null;
let pendingToast = "";

/** Собирает модули страницы; состояние запросов и данные принадлежат Flux. */
export class NotesPage {
  /**
   * Меняет открытую заметку внутри уже смонтированной страницы.
   *
   * @param context Новый путь и параметры маршрута.
   * @returns `false`, если страницу нужно перемонтировать целиком.
   */
  updateRoute(context: PageContext): boolean {
    return mounted?.updateRoute(context) ?? false;
  }

  /**
   * Рендерит страницу заметок по текущему маршруту.
   *
   * @param context Путь и параметры маршрута.
   * @returns HTML страницы.
   */
  async render(context: PageContext): Promise<string> {
    return Handlebars.templates["notes"](buildNotesView(context, noteIdFor(context)));
  }

  /**
   * Подключает список, поиск, редактор и диалоги и запускает загрузку заметок.
   *
   * @param root Корневой узел отрисованной страницы.
   * @param context Путь и параметры маршрута.
   */
  mount(root: ParentNode, context: PageContext): void {
    const elements = getNotesElements(root);
    if (!elements) return;
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
    if (context.path === "/profile") history.replaceState(null, "", "/notes");
    const openedNoteId = noteIdFor(context);
    if (openedNoteId && !context.params.id)
      history.replaceState(null, "", "/notes/" + openedNoteId);
    const isActive = () => mounted === instance;
    let editorRendered = mainRegion.querySelector("[data-note-title]") !== null;
    let mainKey = mainRenderKey(openedNoteId);
    let frame = 0;
    let redirecting = false;
    let childToDelete: string | null = null;
    const events = new AbortController();
    mountMobileSidebar(page, events.signal);

    // Измеряем полную цепочку даже тогда, когда пользователю показано меню.
    const pathObserver = new ResizeObserver(syncBreadcrumbWidth);

    /** Прячет длинную цепочку пути в меню, если она не помещается в шапку заметки. */
    function syncBreadcrumbWidth(): void {
      const trail = mainRegion.querySelector<HTMLElement>(".note-path__trail");
      const nav = trail?.closest<HTMLElement>(".notebook__nav");
      if (!nav || !trail) return;
      const fits = trail.getBoundingClientRect().width <= nav.getBoundingClientRect().width;
      nav.toggleAttribute("data-path-fits", fits);
      if (fits) nav.querySelector("details")?.removeAttribute("open");
    }

    const compactEditor = window.matchMedia("(max-width: 800px)");

    /**
     * На узком экране переносит кнопки заметки в меню, на широком возвращает их в шапку.
     */
    function syncEditorActions(): void {
      const actions = mainRegion.querySelector(".notebook__actions");
      const menu = actions?.querySelector("[data-note-menu]");
      const panel = menu?.querySelector("[data-note-menu-panel]");
      if (!actions || !menu || !panel) return;
      const source = compactEditor.matches ? actions : panel;
      const destination = compactEditor.matches ? panel : actions;
      const before = compactEditor.matches ? null : menu;
      for (const button of source.querySelectorAll(":scope > .icon-button")) {
        destination.insertBefore(button, before);
        if (compactEditor.matches) button.setAttribute("role", "menuitem");
        else button.removeAttribute("role");
      }
      setNoteMenu(false);
    }

    compactEditor.addEventListener("change", syncEditorActions, { signal: events.signal });

    /** Следит за шириной пути и раскладкой кнопок после перерисовки заметки. */
    function syncScrollHints(): void {
      const area = mainRegion.querySelector(".notebook__scroll-area");
      const content = area?.firstElementChild;
      if (!area || !content) return;
      area.toggleAttribute("data-scroll-up", content.scrollTop > 1);
      area.toggleAttribute(
        "data-scroll-down",
        content.scrollTop + content.clientHeight < content.scrollHeight - 1
      );
    }

    const scrollObserver = new ResizeObserver(syncScrollHints);
    mainRegion.addEventListener(
      "scroll",
      (event) => {
        if (
          event.target instanceof Element &&
          event.target.matches(".notebook__scroll-area > .notebook__content")
        )
          syncScrollHints();
      },
      { capture: true, signal: events.signal }
    );

    function observeBreadcrumbs(): void {
      scrollObserver.disconnect();
      for (const element of mainRegion.querySelectorAll(
        ".notebook__scroll-area > .notebook__content, .notebook__scroll-area > .notebook__content > *"
      )) {
        scrollObserver.observe(element);
      }
      syncScrollHints();
      syncEditorActions();
      pathObserver.disconnect();
      const trail = mainRegion.querySelector<HTMLElement>(".note-path__trail");
      const nav = trail?.closest<HTMLElement>(".notebook__nav");
      if (!nav || !trail) return;
      pathObserver.observe(nav);
      pathObserver.observe(trail);
      syncBreadcrumbWidth();
    }

    observeBreadcrumbs();
    const list = mountNotesList({
      region: listRegion,
      get context() {
        return context;
      },
      getNoteId: () => editor.noteId,
      getTitle: () =>
        mainRegion.querySelector<HTMLElement>("[data-note-title]")?.textContent?.trim(),
    });
    const searchView = mountNotesSearch({
      input: search,
      box: searchBox,
      results: searchResults,
      setFilter: list.setFilter,
    });
    const tagPicker = createTagPicker({
      page,
      mainRegion,
      getNoteId: () => editor.noteId,
      isActive,
      onChange: () => editor.scheduleSave(),
      goToLogin,
      onOpenManager: searchView.hide,
    });
    noteActions.setSaveStatus("idle");
    const editor = createNoteEditor({
      page,
      mainRegion,
      noteId: openedNoteId,
      isActive,
      goToLogin,
      showToast,
      getNoteTagIds: tagPicker.getTagIds,
      showTitleInList,
      onCreated: (id) => {
        if (window.location.pathname === "/notes/new")
          history.replaceState(null, "", "/notes/" + id);
        list.replaceDraft(id);
      },
    });
    const destroyProfile = mountProfile(page, {
      onLogout: () => {
        logoutDialog.hidden = false;
      },
    });

    /**
     * Дожидается создания тега и сохраняет заметку перед уходом.
     *
     * @returns `false`, если сохранить не удалось.
     */
    async function finishEditing(): Promise<boolean> {
      await tagPicker.finish();
      return editor.beforeLeave();
    }
    const instance: NotesInstance = {
      path: context.path,
      editor,
      /** Идентификатор заметки, открытой в редакторе. */
      get noteId() {
        return editor.noteId;
      },
      /**
       * Меняет открытую заметку, не перемонтируя страницу.
       *
       * @param id Идентификатор заметки или `new` для черновика.
       */
      set noteId(id) {
        editor.noteId = id;
      },
      deleting: false,

      isDeletingChild: () => instance.deleting && childToDelete !== null,

      /**
       * Открывает другую заметку того же раздела, не уничтожая страницу.
       *
       * @param next Новый маршрут.
       * @returns `false`, если раздел сменился или открыт диалог и нужен полный переход.
       */
      updateRoute(next) {
        // Другие разделы и открытые диалоги имеют собственный жизненный цикл.
        if (
          isFavoritesPath(next.path) !== isFavoritesPath(context.path) ||
          !next.params.id ||
          redirecting ||
          instance.deleting ||
          page.querySelector(".modal:not([hidden])")
        )
          return false;

        context = next;
        instance.path = next.path;
        editor.clearSave();
        editor.noteId = next.params.id;
        noteActions.setSaveStatus("idle");
        searchView.clear();
        tagPicker.close();
        editor.resetSelection();
        setNoteMenu(false);
        const view = buildNotesView(context, editor.noteId);
        const content = mainRegion.querySelector<HTMLElement>(".notebook__content");
        const nav = mainRegion.querySelector<HTMLElement>(".notebook__nav");

        if (
          editorRendered &&
          content &&
          nav &&
          view.hasNote &&
          !view.isLoading &&
          !view.isMainError
        ) {
          nav.innerHTML = Handlebars.partials["note-path"](view);
          content.innerHTML = Handlebars.partials["note-content"](view);
          content.scrollTop = 0;
          syncFavoriteButton();
          observeBreadcrumbs();
          focusPendingTitle();
        } else {
          editorRendered = false;
          mainKey = "";
          syncPage();
        }

        list.render();
        return true;
      },

      finishEditing,

      /** Снимает обработчики страницы и вложенных модулей. */
      dispose() {
        events.abort();
        scrollObserver.disconnect();
        pathObserver.disconnect();
        window.cancelAnimationFrame(frame);
        unsubscribeNotes();
        unsubscribeAuth();
        unsubscribeUi();
        list.destroy();
        searchView.destroy();
        tagPicker.destroy();
        editor.destroy();
        destroyProfile();
      },
    };
    mounted = instance;

    /** Обновляет кнопку избранного по store: нажата, недоступна или ждёт повторной загрузки. */
    function syncFavoriteButton(): void {
      const button = mainRegion.querySelector<HTMLButtonElement>("[data-note-favorite]");
      if (!button) return;
      const id = editor.noteId;
      const { favoriteIds, favoritesStatus, pendingFavoriteIds } = notesStore.getState();
      const saved = !!id && id !== "new";
      const pressed = saved && favoriteIds.includes(id);
      const retry = favoritesStatus === "error";
      button.disabled =
        !saved || (!retry && favoritesStatus !== "ready") || pendingFavoriteIds.includes(id ?? "");
      button.setAttribute("aria-pressed", String(pressed));
      button.title = !saved
        ? "Сначала сохраните заметку"
        : retry
          ? "Повторить загрузку избранного"
          : pressed
            ? "Убрать из избранного"
            : "Добавить в избранное";
      button.setAttribute("aria-label", retry ? button.title : "Избранное");
    }

    /**
     * Переключает избранное у открытой заметки.
     * Если список избранного не загрузился, сначала повторяет его загрузку.
     */
    async function toggleOpenedFavorite(): Promise<void> {
      const id = editor.noteId;
      if (!id || id === "new") return;
      if (notesStore.getState().favoritesStatus === "error") {
        await noteActions.loadFavorites();
        if (isActive() && notesStore.getState().favoritesStatus === "error")
          showToast("Не удалось загрузить избранное", true);
        return;
      }
      try {
        await noteActions.toggleFavorite(id);
      } catch {
        if (isActive() && editor.noteId === id)
          showToast("Не удалось изменить отметку избранного", true);
      }
    }

    /** Ключ состояния основной области до появления редактора. Совпадение позволяет сохранить её DOM. */
    function mainRenderKey(id: string | undefined): string {
      const state = notesStore.getState();
      const load = id ? state.noteLoads[id] : undefined;
      return [
        id,
        state.status === "ready",
        state.status === "error",
        state.loadError,
        getNote(id)?.isLoaded,
        load?.error,
        context.path === "/notes/favorites" ? state.favoritesStatus : "",
        context.path === "/notes/favorites" && state.favoriteIds.length > 0,
      ].join(":");
    }

    /**
     * Реагирует на store: уводит на логин, подставляет приветственную заметку
     * и рисует редактор, пока он ещё не смонтирован.
     */
    function syncPage(): void {
      if (!isActive() || redirecting) return;
      const state = notesStore.getState();
      if (
        authStore.getState().status === "unauthenticated" ||
        state.status === "unauthorized" ||
        Object.values(state.noteLoads).some((load) => load.error === "unauthorized")
      ) {
        void goToLogin();
        return;
      }

      const openedId = noteIdFor(context);
      if (openedId && !instance.noteId) {
        instance.noteId = openedId;
        history.replaceState(null, "", "/notes/" + openedId);
        list.render();
      }

      const id = instance.noteId;
      const note = getNote(id);
      const load = id ? state.noteLoads[id] : undefined;
      if (load?.error === "missing" && !instance.deleting) {
        redirecting = true;
        history.replaceState(null, "", "/notes");
        void router();
        return;
      }

      if (!editorRendered) {
        const key = mainRenderKey(id);
        if (key !== mainKey) {
          mainKey = key;
          editor.resetSelection();
          mainRegion.innerHTML = Handlebars.partials["notes-main"](buildNotesView(context, id));
          observeBreadcrumbs();
          editorRendered = mainRegion.querySelector("[data-note-title]") !== null;
          focusPendingTitle();
        }
      }

      syncFavoriteButton();
      if (
        state.status === "ready" &&
        id &&
        id !== "new" &&
        !note?.isLoaded &&
        (!load || load.status === "ready") &&
        !instance.deleting
      )
        void noteActions.loadNote(id);
    }

    /** Откладывает синхронизацию страницы на следующий кадр. */
    function schedulePage(): void {
      if (frame || !isActive()) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        syncPage();
      });
    }

    const unsubscribeNotes = notesStore.subscribe(schedulePage);
    const unsubscribeAuth = authStore.subscribe(schedulePage);

    /** Повторяет загрузку списка, открытой заметки и догрузку для поиска. */
    function retryLoad(): void {
      void noteActions.loadFavorites();
      const state = notesStore.getState();
      if (state.status !== "ready" || state.loadError) void noteActions.loadNotes({ retry: true });
      if (instance.noteId && instance.noteId !== "new")
        void noteActions.loadNote(instance.noteId, { retry: true });
      list.ensureDetails(true);
      searchView.ensureDetails(true);
    }

    /** После возвращения сети прячет тост, досохраняет заметку и повторяет загрузку. */
    function onOnline(): void {
      hideToast();
      void editor.retrySave();
      retryLoad();
    }
    let online = uiStore.getState().online;

    /** Показывает тост из UiStore и реагирует на потерю или появление сети. */
    function renderUi(): void {
      const ui = uiStore.getState();
      if (online !== ui.online) {
        online = ui.online;
        if (online) onOnline();
        else onOffline();
      }
      const state = uiStore.getState().toast;
      const label = toast.querySelector<HTMLElement>("[data-toast-text]");
      if (label) label.textContent = state?.message ?? "";
      toast.hidden = state === null;
      toast.classList.toggle("toast_error", state?.isError ?? false);
    }

    const unsubscribeUi = uiStore.subscribe(renderUi);
    page.addEventListener("click", onPageClick, { signal: events.signal });

    document.addEventListener(
      "pointerdown",
      (event) => {
        const path = page.querySelector<HTMLDetailsElement>(".note-path__details[open]");
        if (path && event.target instanceof Node && !path.contains(event.target)) path.open = false;
      },
      { signal: events.signal }
    );

    page.addEventListener("keydown", onPageKeyDown, { signal: events.signal });
    renderUi();
    if (pendingToast) {
      showToast(pendingToast);
      pendingToast = "";
    }

    if (!online) onOffline();
    syncPage();
    focusPendingTitle();
    list.ensureDetails();
    void noteActions.loadNotes();
    void noteActions.loadFavorites();
    void tagActions.loadTags().catch((error) => {
      if (isActive() && error instanceof ApiError && error.status === 401) void goToLogin();
    });

    /**
     * Сбрасывает сессию и открывает `/login` без новой записи в истории.
     */
    async function goToLogin(): Promise<void> {
      if (!isActive() || redirecting) return;
      redirecting = true;
      if (authStore.getState().status !== "unauthenticated") {
        authActions.resetAuth("unauthenticated");
      }
      history.replaceState(null, "", "/login");
      await router();
    }

    /**
     * Ставит фокус в заголовок заметки.
     */
    function focusTitle(): void {
      mainRegion.querySelector<HTMLElement>("[data-note-title]")?.focus();
    }

    /**
     * Фокусирует заголовок, если новую заметку только что создали.
     */
    function focusPendingTitle(): void {
      if (
        pendingFocusNoteId !== null &&
        pendingFocusNoteId === instance.noteId &&
        mainRegion.querySelector("[data-note-title]")
      ) {
        pendingFocusNoteId = null;
        focusTitle();
      }
    }

    /** Закрывает модалку подтверждения выхода. */
    function closeLogoutDialog(): void {
      logoutDialog.hidden = true;
    }

    /** Вызывает API logout и переводит пользователя на страницу входа. */
    async function logOut(button: HTMLButtonElement): Promise<void> {
      button.disabled = true;
      if (!(await finishEditing())) {
        button.disabled = false;
        showToast(
          "Не удалось сохранить заметку. Повторите выход после восстановления связи.",
          true
        );
        return;
      }
      await authActions.logOut().catch(() => null);
    }

    /**
     * Открывает или закрывает меню действий заметки.
     *
     * @param open Меню должно быть видно.
     */
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

    /**
     * Показывает подтверждение удаления заметки.
     */
    function openDeleteDialog(childId: string | null = null): void {
      if (instance.deleting) return;

      childToDelete = childId;
      setNoteMenu(false);

      const targetId = childId ?? instance.noteId;
      const note = notesStore.getState().notes.find((item) => item.id === targetId);
      const title = note?.title || "Без названия";

      const message = deleteDialog.querySelector<HTMLElement>("[data-delete-message]");
      if (message) {
        message.textContent = childId
          ? `Удалить вложенную заметку «${title}»?`
          : `Удалить заметку «${title}»?`;
      }

      const error = deleteDialog.querySelector<HTMLElement>("[data-delete-error]");
      if (error) error.hidden = true;

      deleteDialog.hidden = false;
      deleteDialog.querySelector<HTMLButtonElement>("[data-delete-cancel]")?.focus();
    }

    /**
     * Прячет подтверждение удаления.
     */
    function closeDeleteDialog(): void {
      if (instance.deleting) return;

      deleteDialog.hidden = true;
      childToDelete = null;
    }

    /**
     * Блокирует кнопки удаления, пока запрос не завершился.
     *
     * @param deleting Удаление идёт.
     */
    function setDeleting(deleting: boolean): void {
      instance.deleting = deleting;
      for (const button of deleteDialog.querySelectorAll<HTMLButtonElement>("button")) {
        button.disabled = deleting;
      }
      deleteDialog
        .querySelector("[data-delete]")
        ?.classList.toggle("modal__button_loading", deleting);
    }

    /**
     * Пишет ошибку удаления в диалог.
     *
     * @param message Текст для пользователя.
     */
    function showDeleteError(message: string): void {
      const error = deleteDialog.querySelector<HTMLElement>("[data-delete-error]");
      if (error) {
        error.textContent = message;
        error.hidden = false;
      }
    }

    /**
     * Удаляет открытую заметку и возвращает к списку.
     */
    async function deleteNote(): Promise<void> {
      if (instance.deleting) {
        return;
      }
      setDeleting(true);
      if (!(await finishEditing())) {
        setDeleting(false);
        showDeleteError("Не удалось сохранить последние изменения. Повторите попытку.");
        return;
      }
      if (mounted !== instance) {
        return;
      }

      const childId = childToDelete;
      const id = childId ?? instance.noteId;
      const index = notesStore.getState().notes.findIndex((note) => note.id === id);
      try {
        if (id && id !== "new") {
          await noteActions.deleteNote(id);
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

      if (childId) {
        if (mounted !== instance) return;

        const links = mainRegion.querySelectorAll<HTMLElement>("[data-child-note-id]");
        for (const link of links) {
          if (link.dataset.childNoteId === childId) {
            link.closest<HTMLElement>("[data-block]")?.remove();
          }
        }

        editor.scheduleSave();
        const saved = await finishEditing();

        if (mounted !== instance) return;

        setDeleting(false);
        closeDeleteDialog();

        if (saved) {
          showToast("Подзаметка удалена");
        } else {
          showToast("Подзаметка удалена, но изменение родительской заметки ещё не сохранено", true);
        }
        return;
      }

      editor.clearSave();

      let next: ReadonlyState<Note> | undefined;
      if (id && index !== -1) {
        next = notesStore.getState().notes[index] ?? notesStore.getState().notes[index - 1];
      }

      if (mounted !== instance) {
        return;
      }

      pendingToast = "Заметка удалена";
      history.replaceState(null, "", next ? "/notes/" + next.id : "/notes");
      await router();
    }

    /**
     * Показывает тост страницы заметок.
     *
     * @param text Текст.
     * @param isError Красить тост как ошибку.
     */
    function showToast(text: string, isError = false): void {
      uiActions.showToast(text, isError);
    }

    /**
     * Сразу прячет тост страницы заметок.
     */
    function hideToast(): void {
      uiActions.hideToast();
    }

    /**
     * Открывает пустую заметку с локальным id `new`.
     */
    function openDraft(): void {
      if (instance.noteId === "new") {
        focusTitle();
        return;
      }
      pendingFocusNoteId = "new";
      void navigate("/notes/" + "new");
    }

    /**
     * Обновляет заголовок карточки в списке, не перерисовывая редактор.
     *
     * @param title Новый заголовок. Пустой показывается как «Без названия».
     */
    function showTitleInList(title: string): void {
      const text = title || "Без названия";
      list.updateTitle(title);

      mainRegion.querySelectorAll<HTMLElement>("[data-current-crumb]").forEach((crumb) => {
        crumb.textContent = text;
      });
    }

    /**
     * Клики по списку, тегам, меню заметки и кнопкам страницы.
     *
     * @param event Клик на странице заметок.
     */
    function onPageClick(event: MouseEvent): void {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const removeSubnote = target.closest<HTMLButtonElement>("[data-subnote-remove]");
      const childId = removeSubnote?.dataset.subnoteRemove;

      if (childId) {
        openDeleteDialog(childId);
        return;
      }

      if (target.closest("[data-note-menu-panel] button")) setNoteMenu(false);
      if (editor.handleClick(target)) return;
      if (
        tagPicker.handleClick(target) ||
        list.handleClick(target) ||
        searchView.handleClick(target)
      )
        return;

      if (!target.closest("[data-note-menu]")) {
        setNoteMenu(false);
      }

      if (target.closest("[data-note-favorite]")) {
        void toggleOpenedFavorite();
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

    /**
     * По Escape закрывает поиск, меню заметки, меню блоков и тегов, диалоги выхода и удаления,
     * останавливает голосовой ввод.
     */
    function onPageKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") {
        return;
      }

      const path = page.querySelector<HTMLDetailsElement>(".note-path__details[open]");
      if (path) {
        path.open = false;
        path.querySelector("summary")?.focus();
        return;
      }
      editor.escape();
      searchView.hide();
      closeLogoutDialog();
      setNoteMenu(false);
      closeDeleteDialog();
      tagPicker.close();
    }

    /**
     * Показывает тост «Потеря соединения».
     */
    function onOffline(): void {
      uiActions.showToast("Потеря соединения", true, 0);
    }
  }

  /**
   * Адрес, который нужно вернуть в историю, если пользователь ушёл с черновика или профиля.
   *
   * @returns Путь открытой заметки или раздела.
   */
  getUrl(): string {
    if (mounted && isFavoritesPath(mounted.path)) return mounted.path;
    return mounted?.noteId ? "/notes/" + mounted.noteId : (mounted?.path ?? "/notes");
  }

  /**
   * Сохраняет открытую заметку перед уходом с маршрута.
   *
   * @returns `false`, если сохранить не удалось и переход стоит отменить.
   */
  async beforeLeave(): Promise<boolean> {
    const leaving = mounted;
    if (!leaving || authStore.getState().status !== "authenticated") return true;
    if (leaving.isDeletingChild()) return false;
    const saved = await leaving.finishEditing();
    if (!saved && mounted === leaving)
      uiActions.showToast("Не удалось сохранить заметку. Правки остались в редакторе.", true);
    return saved;
  }

  /** Снимает обработчики страницы и скрывает тост. */
  async destroy(): Promise<void> {
    const leaving = mounted;
    if (!leaving) return;
    mounted = null;
    leaving.dispose();
    uiActions.hideToast();
  }
}
