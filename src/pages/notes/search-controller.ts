import { toTagView } from "@/domain/tags";
import * as noteActions from "@/flux/notes/note-actions";
import { notesStore } from "@/flux/notes/note-store";
import { tagStore } from "@/flux/tags/tag-store";
import { filterNotes, filterTags } from "@/pages/notes/search";

const SEARCH_DELAY = 200;
const SEARCH_RESULTS_LIMIT = 8;
const SEARCH_TAGS_LIMIT = 5;

/**
 * Подключает поле поиска: результаты, выбор тега и очистку.
 *
 * @param options Поле, контейнер результатов и установка фильтра по тегу.
 * @returns Обработчик кликов и снятие подписок.
 */
export function mountNotesSearch(options: {
  input: HTMLInputElement;
  box: HTMLElement;
  results: HTMLElement;
  setFilter: (ids: string[]) => void;
}) {
  const { input, box, results } = options;
  let timer: number | undefined;
  let frame = 0;
  let disposed = false;
  const events = new AbortController();

  /**
   * Догружает тела заметок, если в поле поиска что-то введено.
   * Список API не содержит текст: обычному поиску он нужен так же, как тегам.
   *
   * @param retry Повторить догрузку после ошибки.
   */
  function ensureDetails(retry = false): void {
    if (input.value.trim()) void noteActions.loadMissingDetails({ retry });
  }

  /** Рисует подсказки заметок и тегов, пока фокус внутри поля поиска. */
  function render(): void {
    if (disposed) return;
    const state = notesStore.getState();
    const query = input.value.trim();
    const canSearch = query !== "" && state.status === "ready";
    const found = canSearch
      ? filterNotes(state.notes, query)
          .slice(0, SEARCH_RESULTS_LIMIT)
          .map((note) => ({
            href: "/notes/" + note.id,
            title: note.title || "Без названия",
            tags: note.tags.map(toTagView),
          }))
      : [];
    const tags = canSearch
      ? filterTags([...tagStore.getState().tags], query)
          .slice(0, SEARCH_TAGS_LIMIT)
          .map(toTagView)
      : [];
    results.hidden = !canSearch || !box.contains(document.activeElement);
    results.innerHTML = canSearch
      ? Handlebars.partials["search-results"]({
          hasResults: found.length > 0,
          results: found,
          hasTags: tags.length > 0,
          tags,
          isSearching: state.detailsStatus === "loading",
        })
      : "";
  }

  /** Откладывает перерисовку подсказок на следующий кадр. */
  function schedule(): void {
    if (frame || disposed) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      ensureDetails();
      render();
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

  /** Очищает поле поиска и прячет подсказки. */
  function clear(): void {
    window.clearTimeout(timer);
    input.value = "";
    results.hidden = true;
    results.innerHTML = "";
  }
  input.addEventListener(
    "input",
    () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        ensureDetails();
        render();
      }, SEARCH_DELAY);
    },
    { signal: events.signal }
  );
  input.addEventListener(
    "focus",
    () => {
      ensureDetails();
      render();
    },
    { signal: events.signal }
  );
  box.addEventListener(
    "focusout",
    (event) => {
      if (!(event.relatedTarget instanceof Node) || !box.contains(event.relatedTarget))
        results.hidden = true;
    },
    { signal: events.signal }
  );

  return {
    ensureDetails,
    clear,
    hide: () => {
      results.hidden = true;
    },
    /**
     * Выбирает тег из подсказки или очищает поиск.
     *
     * @param target Элемент, по которому кликнули.
     * @returns `true`, если клик относится к поиску.
     */
    handleClick(target: Element): boolean {
      const id = target.closest<HTMLElement>("[data-search-tag]")?.dataset.searchTag;
      if (id) {
        clear();
        options.setFilter([id]);
        return true;
      }
      if (target.closest("[data-search-clear]")) {
        clear();
        input.focus();
        return true;
      }
      return false;
    },
    /** Снимает подписки поиска и отменяет отложенную перерисовку. */
    destroy(): void {
      disposed = true;
      events.abort();
      unsubscribeNotes();
      unsubscribeTags();
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    },
  };
}
