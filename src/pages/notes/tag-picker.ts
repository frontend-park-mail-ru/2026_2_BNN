import { ApiError } from "@/api";
import { TAG_NAME_MAX_LENGTH, findTagByName, nextTagColor, toTagView } from "@/domain/tags";
import * as tagActions from "@/flux/tags/tag-actions";
import { tagStore } from "@/flux/tags/tag-store";
import { getTags, getNote, tagsByIds } from "@/pages/notes/selectors";
import { mountTagsDialog } from "@/pages/notes/tags-dialog";
/**
 * Управляет чипами тегов открытой заметки и окном их выбора.
 *
 * @param options Контейнер заметки и колбэк, что набор тегов изменился.
 * @returns Чтение id с чипов, клики и снятие обработчиков.
 */
export function createTagPicker(options: {
  page: HTMLElement;
  mainRegion: HTMLElement;
  getNoteId: () => string | undefined;
  isActive: () => boolean;
  onChange: () => void;
  goToLogin: () => Promise<void>;
  onOpenManager: () => void;
}) {
  const { mainRegion, isActive, onChange, goToLogin } = options;
  let creatingTag = false;
  let pending: Promise<void> | null = null;
  let disposed = false;
  /**
   * Создаёт тег из поля пикера. Повторный вызов ждёт уже идущий запрос.
   *
   * @param name Название нового тега.
   */
  function createTagFromPicker(name: string): Promise<void> {
    if (pending) return pending;
    const request = createTag(name).finally(() => {
      if (pending === request) pending = null;
    });
    pending = request;
    return request;
  }

  /**
   * Собирает id тегов с чипов открытой заметки.
   *
   * @returns Идентификаторы в порядке чипов.
   */
  function getNoteTagIds(): string[] {
    const ids: string[] = [];
    for (const chip of mainRegion.querySelectorAll<HTMLElement>("[data-note-tag]")) {
      if (chip.dataset.noteTag) {
        ids.push(chip.dataset.noteTag);
      }
    }
    return ids;
  }

  /**
   * Перерисовывает чипы тегов у открытой заметки.
   *
   * @param ids Теги, которые должны остаться на заметке.
   */
  function renderNoteTags(ids: string[]): void {
    const list = mainRegion.querySelector<HTMLElement>("[data-note-tags]");
    if (!list) {
      return;
    }
    const fallback = getNote(options.getNoteId())?.tags ?? [];
    list.innerHTML = Handlebars.partials["note-tags"]({
      noteTags: tagsByIds(ids, fallback).map(toTagView),
    });
    setTagPickerExpanded(mainRegion.querySelector("[data-tag-picker]") !== null);
  }

  /**
   * Синхронизирует `aria-expanded` кнопки пикера тегов.
   *
   * @param open Пикер открыт.
   */
  function setTagPickerExpanded(open: boolean): void {
    mainRegion.querySelector("[data-tag-picker-open]")?.setAttribute("aria-expanded", String(open));
  }

  /**
   * Данные шаблона пикера: подходящие теги и имя, которого ещё нет.
   *
   * @param query Строка поиска в пикере.
   * @returns Поля для `tag-picker` и `tag-picker-list`.
   */
  function tagPickerView(query: string) {
    const selected = getNoteTagIds();
    const key = query.trim().toLowerCase();
    const name = query.trim().slice(0, TAG_NAME_MAX_LENGTH);
    const tags = getTags()
      .filter((tag) => tag.name.toLowerCase().includes(key))
      .map((tag) => ({ ...toTagView(tag), isSelected: selected.includes(tag.id) }));
    return {
      tags: tags,
      hasQuery: key !== "",
      createName: name !== "" && !findTagByName(getTags(), name) ? name : "",
    };
  }

  /**
   * Вставляет пикер тегов под чипами и фокусирует поле.
   */
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

  /**
   * Убирает пикер тегов из заметки.
   */
  function closeTagPicker(): void {
    mainRegion.querySelector("[data-tag-picker]")?.remove();
    setTagPickerExpanded(false);
  }

  /**
   * Обновляет только список внутри уже открытого пикера.
   */
  function renderPickerList(): void {
    const picker = mainRegion.querySelector<HTMLElement>("[data-tag-picker]");
    const input = picker?.querySelector<HTMLInputElement>("[data-tag-picker-input]");
    const list = picker?.querySelector<HTMLElement>("[data-tag-picker-list]");
    if (!input || !list) {
      return;
    }
    list.innerHTML = Handlebars.partials["tag-picker-list"](tagPickerView(input.value));
  }

  /**
   * Показывает или прячет ошибку под полем нового тега.
   *
   * @param message Текст. Пустая строка скрывает ошибку.
   */
  function showTagPickerError(message: string): void {
    const error = mainRegion.querySelector<HTMLElement>("[data-tag-picker-error]");
    if (error) {
      error.textContent = message;
      error.hidden = message === "";
    }
  }

  /**
   * Вешает тег на заметку или снимает его и ставит сохранение в очередь.
   *
   * @param id Идентификатор тега.
   */
  function toggleNoteTag(id: string): void {
    const ids = getNoteTagIds();
    renderNoteTags(ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
    renderPickerList();
    mainRegion.querySelector<HTMLInputElement>("[data-tag-picker-input]")?.focus();
    onChange();
  }

  /**
   * Создаёт тег из пикера и сразу добавляет его к заметке.
   *
   * @param name Название без лишних пробелов.
   */
  async function createTag(name: string): Promise<void> {
    if (creatingTag) {
      return;
    }
    creatingTag = true;
    showTagPickerError("");

    try {
      const tag = await tagActions.createTag({ name, color: nextTagColor(getTags()) });
      if (!isActive()) {
        return;
      }
      renderNoteTags([...getNoteTagIds(), tag.id]);
      const input = mainRegion.querySelector<HTMLInputElement>("[data-tag-picker-input]");
      if (input) {
        input.value = "";
        input.focus();
      }
      renderPickerList();
      onChange();
    } catch (error) {
      if (!isActive()) return;
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

  /**
   * Escape закрывает пикер, Enter выбирает существующий тег или создаёт новый.
   *
   * @param event Клавиша в поле пикера.
   * @param input Поле названия.
   */
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
    const existing = findTagByName(getTags(), name);
    if (existing) {
      input.value = "";
      toggleNoteTag(existing.id);
      return;
    }
    void createTagFromPicker(name.slice(0, TAG_NAME_MAX_LENGTH));
  }
  /**
   * Обрабатывает клики по чипам, пикеру и кнопке управления тегами.
   *
   * @param target Элемент, по которому кликнули.
   * @returns `true`, если клик относится к тегам заметки.
   */
  function handleClick(target: Element): boolean {
    if (!target.closest("[data-tag-picker], [data-tag-picker-open]")) closeTagPicker();
    if (target.closest("[data-tags-manage]")) {
      closeTagPicker();
      options.onOpenManager();
      dialog?.open();
      return true;
    }
    if (target.closest("[data-tag-picker-open]")) {
      if (mainRegion.querySelector("[data-tag-picker]")) closeTagPicker();
      else openTagPicker();
      return true;
    }
    const tag = target.closest<HTMLElement>("[data-tag-picker-toggle]")?.dataset.tagPickerToggle;
    if (tag) {
      toggleNoteTag(tag);
      return true;
    }
    if (target.closest("[data-tag-picker-create]")) {
      const name = mainRegion
        .querySelector<HTMLInputElement>("[data-tag-picker-input]")
        ?.value.trim()
        .slice(0, TAG_NAME_MAX_LENGTH);
      if (name) void createTagFromPicker(name);
      return true;
    }
    const removed = target.closest<HTMLElement>("[data-note-tag-remove]")?.dataset.noteTagRemove;
    if (removed) {
      renderNoteTags(getNoteTagIds().filter((id) => id !== removed));
      renderPickerList();
      onChange();
      return true;
    }
    return false;
  }
  let previousTags = tagStore.getState().tags;
  const unsubscribe = tagStore.subscribe(() => {
    const tags = tagStore.getState().tags;
    if (tags === previousTags) return;
    const removed = previousTags
      .filter((tag) => !tags.some((item) => item.id === tag.id))
      .map((tag) => tag.id);
    previousTags = tags;
    queueMicrotask(() => {
      if (disposed || !isActive()) return;
      const ids = getNoteTagIds();
      const next = ids.filter((id) => !removed.includes(id));
      renderNoteTags(next);
      renderPickerList();
      if (next.length !== ids.length) onChange();
    });
  });
  const dialog = mountTagsDialog(options.page, {
    getTags,
    onUnauthorized: goToLogin,
  });
  const events = new AbortController();
  mainRegion.addEventListener(
    "input",
    (event) => {
      if (
        event.target instanceof HTMLInputElement &&
        event.target.matches("[data-tag-picker-input]")
      ) {
        showTagPickerError("");
        renderPickerList();
      }
    },
    { signal: events.signal }
  );
  mainRegion.addEventListener(
    "keydown",
    (event) => {
      if (
        event.target instanceof HTMLInputElement &&
        event.target.matches("[data-tag-picker-input]")
      )
        onTagPickerKeyDown(event, event.target);
    },
    { signal: events.signal }
  );
  return {
    getTagIds: getNoteTagIds,
    handleClick,
    close: closeTagPicker,
    finish: async () => {
      if (pending) await pending;
    },
    destroy: () => {
      disposed = true;
      events.abort();
      unsubscribe();
      dialog?.destroy();
    },
  };
}
