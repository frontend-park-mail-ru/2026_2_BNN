import * as noteActions from "@/flux/notes/note-actions";
import { notesStore } from "@/flux/notes/note-store";
import * as tagActions from "@/flux/tags/tag-actions";
import { tagStore } from "@/flux/tags/tag-store";
import type { PageContext } from "@/router";
import { buildNotesView, isFavoritesPath } from "@/pages/notes/view";

/** Список и фильтр обновляются независимо от DOM открытой заметки. */
export function mountNotesList(options: {
  region: HTMLElement;
  context: PageContext;
  getNoteId: () => string | undefined;
  getTitle: () => string | undefined;
}) {
  const { region } = options;
  const tooltip = document.createElement("div");
  tooltip.className = "note-title-tooltip";
  tooltip.setAttribute("aria-hidden", "true");
  const tooltipEvents = new AbortController();
  const listenerOptions = { signal: tooltipEvents.signal };

  /** Убирает всплывающую подсказку с полным названием заметки. */
  function hideTooltip(): void {
    tooltip.remove();
  }

  /**
   * Показывает полное название, если в карточке оно обрезано.
   *
   * @param event Наведение или фокус внутри списка.
   */
  function showTooltip(event: Event): void {
    const link = event.target instanceof Element ? event.target.closest(".card") : null;
    const title = link?.querySelector<HTMLElement>(".card__title");
    if (!title || title.scrollWidth <= title.clientWidth) {
      hideTooltip();
      return;
    }
    tooltip.textContent = title.textContent;
    document.body.append(tooltip);
    const rect = title.getBoundingClientRect();
    const left = Math.min(
      rect.left,
      document.documentElement.clientWidth - tooltip.offsetWidth - 8
    );
    const top =
      rect.bottom + 6 + tooltip.offsetHeight <= window.innerHeight
        ? rect.bottom + 6
        : rect.top - tooltip.offsetHeight - 6;
    tooltip.style.left = Math.max(8, left) + "px";
    tooltip.style.top = Math.max(8, top) + "px";
  }
  region.addEventListener("mouseover", showTooltip, listenerOptions);
  region.addEventListener("mouseleave", hideTooltip, listenerOptions);
  region.addEventListener("focusin", showTooltip, listenerOptions);
  region.addEventListener("focusout", hideTooltip, listenerOptions);
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") hideTooltip();
    },
    listenerOptions
  );
  window.addEventListener("scroll", hideTooltip, { ...listenerOptions, capture: true });
  window.addEventListener("resize", hideTooltip, listenerOptions);
  let collapsed = false;
  const collapsedNotes = new Set<string>();
  let frame = 0;
  let disposed = false;

  /**
   * Показывает или прячет детей ветки по запомненному состоянию кнопки.
   *
   * @param button Кнопка сворачивания у заметки с дочерними заметками.
   */
  function syncBranch(button: HTMLButtonElement): void {
    const id = button.dataset.noteTreeToggle;
    const item = button.closest(".note-tree__item");
    const children = item?.querySelector<HTMLElement>(":scope > [data-note-tree-children]");

    if (!id || !children) return;

    const expanded = !collapsedNotes.has(id);
    children.hidden = !expanded;
    button.setAttribute("aria-expanded", String(expanded));
    button.setAttribute(
      "aria-label",
      expanded ? "Свернуть вложенные заметки" : "Развернуть вложенные заметки"
    );
  }

  /**
   * Догружает тела заметок, если включён фильтр по тегам.
   *
   * @param retry Повторить догрузку после ошибки.
   */
  function ensureDetails(retry = false): void {
    if (!tagStore.getState().activeIds.length) return;
    const state = notesStore.getState();
    const ids = isFavoritesPath(options.context.path) ? new Set(state.favoriteIds) : undefined;
    void noteActions.loadMissingDetails({ retry, tagsOnly: true, ids });
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
    hideTooltip();
    region.innerHTML = Handlebars.partials["notes-list"](
      buildNotesView(options.context, options.getNoteId(), collapsed)
    );
    const title = options.getTitle();
    if (title !== undefined) updateTitle(title);
    region.querySelectorAll<HTMLButtonElement>("[data-note-tree-toggle]").forEach(syncBranch);
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
      (state.notes !== previous.notes &&
        !(tagStore.getState().activeIds.length && state.detailsStatus === "loading")) ||
      state.status !== previous.status ||
      state.detailsStatus !== previous.detailsStatus ||
      (isFavoritesPath(options.context.path) &&
        (state.favoritesStatus !== previous.favoritesStatus ||
          state.favoriteIds !== previous.favoriteIds))
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
    const toggle = target.closest<HTMLButtonElement>("[data-note-tree-toggle]");
    const branchId = toggle?.dataset.noteTreeToggle;

    if (toggle && branchId) {
      toggle.focus({ preventScroll: true });
      if (collapsedNotes.has(branchId)) {
        collapsedNotes.delete(branchId);
      } else {
        collapsedNotes.add(branchId);
      }

      syncBranch(toggle);
      return true;
    }

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
      tooltipEvents.abort();
      hideTooltip();
      disposed = true;
      unsubscribeNotes();
      unsubscribeTags();
      window.cancelAnimationFrame(frame);
    },
  };
}
