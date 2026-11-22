import * as noteActions from "@/flux/notes/note-actions";
import { notesStore } from "@/flux/notes/note-store";
import * as tagActions from "@/flux/tags/tag-actions";
import { tagStore } from "@/flux/tags/tag-store";
import type { PageContext } from "@/router";
import { buildNotesView } from "@/pages/notes/view";

/** Список и фильтр обновляются независимо от DOM открытой заметки. */
export function mountNotesList(options: {
  region: HTMLElement;
  context: PageContext;
  getNoteId: () => string | undefined;
  getTitle: () => string | undefined;
}) {
  const { region } = options;
  let collapsed = false;
  let frame = 0;
  let disposed = false;

  /**
   * Догружает тела заметок, если включён фильтр по тегам.
   *
   * @param retry Повторить догрузку после ошибки.
   */
  function ensureDetails(retry = false): void {
    if (tagStore.getState().activeIds.length) void noteActions.loadMissingDetails({ retry });
  }

  /**
   * Меняет заголовок активной карточки, не перерисовывая весь список.
   *
   * @param title Текст из редактора.
   */
  function updateTitle(title: string): void {
    const card = region.querySelector<HTMLElement>(".card_active .card__title");
    if (card) card.textContent = title || "Без названия";
  }

  /** Перерисовывает список из store и возвращает заголовок открытой заметки. */
  function render(): void {
    if (disposed) return;
    region.innerHTML = Handlebars.partials["notes-list"](
      buildNotesView(options.context, options.getNoteId(), collapsed)
    );
    const title = options.getTitle();
    if (title !== undefined) updateTitle(title);
  }

  /** Откладывает перерисовку списка на следующий кадр. */
  function schedule(): void {
    if (frame || disposed) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      render();
      ensureDetails();
    });
  }

  let previous = notesStore.getState();
  const unsubscribeNotes = notesStore.subscribe(() => {
    const state = notesStore.getState();
    if (
      state.notes !== previous.notes ||
      state.status !== previous.status ||
      state.detailsStatus !== previous.detailsStatus
    )
      schedule();
    previous = state;
  });
  const unsubscribeTags = tagStore.subscribe(schedule);

  /**
   * Заменяет фильтр по тегам и при необходимости догружает тела заметок.
   *
   * @param ids Выбранные теги. Пустой массив снимает фильтр.
   */
  function setFilter(ids: string[]): void {
    tagActions.setFilter(ids);
    ensureDetails();
  }

  /**
   * Обрабатывает клик по фильтру тегов в списке.
   *
   * @param target Элемент, по которому кликнули.
   * @returns `true`, если клик относится к фильтру.
   */
  function handleClick(target: Element): boolean {
    if (target.closest("[data-tag-filter-toggle]")) {
      collapsed = !collapsed;
      render();
      region.querySelector<HTMLElement>("[data-tag-filter-toggle]")?.focus();
      return true;
    }
    const id = target.closest<HTMLElement>("[data-tag-filter]")?.dataset.tagFilter;
    if (id) {
      tagActions.toggleFilter(id);
      ensureDetails();
      return true;
    }
    if (target.closest("[data-tag-filter-reset]")) {
      setFilter([]);
      return true;
    }
    return false;
  }

  return {
    render,
    updateTitle,
    handleClick,
    setFilter,
    ensureDetails,
    /**
     * Подменяет ссылку черновика на адрес созданной заметки.
     *
     * @param id Идентификатор заметки, которую только что сохранили.
     */
    replaceDraft(id: string): void {
      const card = region.querySelector<HTMLAnchorElement>('a[href="/notes/new"]');
      if (card) card.href = "/notes/" + id;
      schedule();
    },
    /** Снимает подписки списка и отменяет отложенную перерисовку. */
    destroy(): void {
      disposed = true;
      unsubscribeNotes();
      unsubscribeTags();
      window.cancelAnimationFrame(frame);
    },
  };
}
