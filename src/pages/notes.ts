import { ApiError } from "../api";
import * as authActions from "../flux/auth/auth-actions";
import { authStore } from "../flux/auth/auth-store";
import type { ReadonlyState } from "../flux/base-store";
import type { NoteStateItem as Note } from "../flux/notes/note-action-types";
import * as noteActions from "../flux/notes/note-actions";
import { notesStore } from "../flux/notes/note-store";
import * as tagActions from "../flux/tags/tag-actions";
import * as uiActions from "../flux/ui/ui-actions";
import { uiStore } from "../flux/ui/ui-store";
import { router, navigate, type PageContext } from "../router";
import { createNoteEditor, type NoteEditor } from "./notes/editor/controller";
import { getNotesElements } from "./notes/elements";
import { buildNotesView, noteIdFor } from "./notes/view";
import { getNote } from "./notes/selectors";
import { mountNotesList } from "./notes/list";
import { mountNotesSearch } from "./notes/search-controller";
import { createTagPicker } from "./notes/tag-picker";
import { mountProfile } from "./profile";

/** Смонтированная страница заметок. Нужна, чтобы отличать устаревший ответ от текущего экрана. */
interface NotesInstance {
  path: string;
  editor: NoteEditor;
  noteId: string | undefined;
  deleting: boolean;
  finishEditing: () => Promise<boolean>;
  dispose: () => void;
  isDeletingChild: () => boolean;
}

let mounted: NotesInstance | null = null;
let pendingFocusNoteId: string | null = null;
let pendingToast = "";

/** Собирает модули страницы; состояние запросов и данные принадлежат Flux. */
export class NotesPage {
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
  async mount(root: ParentNode, context: PageContext): Promise<void> {
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
    let mainKey = "";
    let frame = 0;
    let redirecting = false;
    let childToDelete: string | null = null;
    const events = new AbortController();
    const list = mountNotesList({
      region: listRegion,
      context,
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
      notesCount: () => notesStore.getState().notes.length,
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
      finishEditing,
      /** Снимает обработчики страницы и вложенных модулей. */
      dispose() {
        events.abort();
        window.cancelAnimationFrame(frame);
        unsubscribeNotes();
        unsubscribeUi();
        list.destroy();
        searchView.destroy();
        tagPicker.destroy();
        editor.destroy();
        destroyProfile();
      },
    };
    mounted = instance;

    /**
     * Реагирует на store: уводит на логин, подставляет приветственную заметку
     * и рисует редактор, пока он ещё не смонтирован.
     */
    function syncPage(): void {
      if (!isActive() || redirecting) return;
      const state = notesStore.getState();
      if (
        state.status === "unauthorized" ||
        Object.values(state.noteLoads).some((load) => load.error === "unauthorized")
      ) {
        redirecting = true;
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
        const key = [
          id,
          state.status,
          state.loadError,
          note?.isLoaded,
          load?.status,
          load?.error,
        ].join(":");
        if (key !== mainKey) {
          mainKey = key;
          editor.resetSelection();
          mainRegion.innerHTML = Handlebars.partials["notes-main"](buildNotesView(context, id));
          editorRendered = mainRegion.querySelector("[data-note-title]") !== null;
          focusPendingTitle();
        }
      }

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

    /** Повторяет загрузку списка, открытой заметки и догрузку для поиска. */
    function retryLoad(): void {
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
    void tagActions.loadTags().catch((error) => {
      if (isActive() && error instanceof ApiError && error.status === 401) void goToLogin();
    });

    /**
     * Сбрасывает сессию и открывает `/login` без новой записи в истории.
     */
    async function goToLogin(): Promise<void> {
      authActions.resetAuth("unauthenticated");
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

      await navigate("/login");
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
