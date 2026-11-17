import type { BlockType } from "../../../types/note";
import {
  caretX,
  collapsedIn,
  moveCaretToBlock,
  onEdgeLine,
  placeAtChar,
  placeCaret,
  reachesEdge,
  visibleText,
} from "./caret";
import { BLOCK_OPTIONS } from "./constants";
import { applyInlineFormat, inlineFormatState, type InlineFormat } from "./inline-format";
/**
 * Следит за выделением строк, панелью форматирования и протяжкой через несколько блоков.
 *
 * @param options Узлы редактора и колбэк сохранения после смены типа блока.
 * @returns Обработчики выделения, которые подключает контроллер редактора.
 */
export function createEditorSelection(options: {
  page: HTMLElement;
  mainRegion: HTMLElement;
  formatBar: HTMLElement | null;
  timerSave: () => void;
  closeBlockMenu: () => void;
}) {
  const { page, mainRegion, formatBar, timerSave, closeBlockMenu } = options;
  const selectionTypeMenu = formatBar?.querySelector<HTMLElement>("[data-selection-types]");
  const selectionTypeToggle = formatBar?.querySelector<HTMLButtonElement>(
    "[data-selection-type-toggle]"
  );
  let markAnchor: HTMLElement | null = null;
  let markFocus: HTMLElement | null = null;
  let dragAnchor: HTMLElement | null = null;
  let applyingInlineFormat = false;

  /** Текстовые блоки в порядке документа. Картинки и файлы пропускаются. */
  function textBlocks(): HTMLElement[] {
    return [...mainRegion.querySelectorAll<HTMLElement>("[data-block]")].filter((block) =>
      block.querySelector("[data-block-text]")
    );
  }

  /**
   * Блоки, выделенные протяжкой через несколько строк.
   *
   * @returns Узлы с классом `notebook__block_marked`.
   */
  function markedBlocks(): HTMLElement[] {
    return [...mainRegion.querySelectorAll<HTMLElement>(".notebook__block_marked")];
  }

  /**
   * Снимает выделение нескольких блоков.
   */
  function clearMarked(): void {
    mainRegion.querySelectorAll(".notebook__block_marked").forEach((node) => {
      node.classList.remove("notebook__block_marked");
    });
    markAnchor = null;
    markFocus = null;
  }

  /**
   * Подсвечивает непрерывный кусок строк.
   * Одно выделение браузера не может лежать сразу в нескольких contenteditable.
   *
   * @param anchor Блок, с которого начали.
   * @param focus Блок, на котором выделение заканчивается.
   * @param lock Ставит каретку в конечный блок. Пока тянут мышью, этого не делаем.
   * @returns `false`, если между блоками вложение или это одна и та же строка.
   */
  function markRange(anchor: HTMLElement, focus: HTMLElement, lock: boolean): boolean {
    mainRegion.querySelectorAll(".notebook__block_marked").forEach((node) => {
      node.classList.remove("notebook__block_marked");
    });
    const all = [...mainRegion.querySelectorAll<HTMLElement>("[data-block]")];
    const from = all.indexOf(anchor);
    const to = all.indexOf(focus);
    if (from < 0 || to < 0 || from === to) {
      markAnchor = null;
      markFocus = null;
      return false;
    }

    const start = Math.min(from, to);
    const end = Math.max(from, to);
    const slice = all.slice(start, end + 1);
    if (slice.some((block) => !block.querySelector("[data-block-text]"))) {
      markAnchor = null;
      markFocus = null;
      return false;
    }

    markAnchor = anchor;
    markFocus = focus;
    slice.forEach((block) => {
      block.classList.add("notebook__block_marked");
    });
    if (!lock) {
      return true;
    }

    const host = focus.querySelector<HTMLElement>("[data-block-text]");
    if (!host) {
      return true;
    }
    const range = document.createRange();
    range.selectNodeContents(host);
    host.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return true;
  }

  /**
   * Ищет ближайший текстовый блок сверху или снизу. Картинки и файлы пропускает.
   *
   * @param block Текущий блок.
   * @param direction `1` вниз, `-1` вверх.
   * @returns Соседний текстовый блок или `null`.
   */
  function neighborTextBlock(block: HTMLElement, direction: 1 | -1): HTMLElement | null {
    let cursor: Element | null =
      direction === 1 ? block.nextElementSibling : block.previousElementSibling;
    while (cursor instanceof HTMLElement) {
      if (cursor.matches("[data-block]") && cursor.querySelector("[data-block-text]")) {
        return cursor;
      }
      cursor = direction === 1 ? cursor.nextElementSibling : cursor.previousElementSibling;
    }
    return null;
  }

  /** Сосед только если он сразу рядом: через картинку строки не склеиваем. */
  function touchingTextBlock(block: HTMLElement, direction: 1 | -1): HTMLElement | null {
    const sibling = direction === 1 ? block.nextElementSibling : block.previousElementSibling;
    if (!(sibling instanceof HTMLElement) || !sibling.matches("[data-block]")) {
      return null;
    }
    return sibling.querySelector("[data-block-text]") ? sibling : null;
  }

  /**
   * Схлопывает выделенные блоки в первый и очищает его текст.
   *
   * @returns Оставшийся блок или `null`, если выделения не было.
   */
  function deleteMarked(): HTMLElement | null {
    const blocks = markedBlocks();
    const first = blocks[0];
    const text = first?.querySelector<HTMLElement>("[data-block-text]");
    if (!first || !text) {
      return null;
    }
    if (formatBar && blocks.some((block) => block.contains(formatBar))) {
      parkFormatBar();
    }
    blocks.slice(1).forEach((block) => {
      block.remove();
    });
    text.replaceChildren();
    clearMarked();
    placeCaret(text, false);
    return text;
  }

  /** Переносит текст source в конец target и убирает source. Каретка остаётся на стыке. */
  function mergeBlocks(target: HTMLElement, source: HTMLElement): void {
    const targetText = target.querySelector<HTMLElement>("[data-block-text]");
    const sourceText = source.querySelector<HTMLElement>("[data-block-text]");
    if (!targetText || !sourceText) {
      return;
    }
    clearMarked();
    if (formatBar && (target.contains(formatBar) || source.contains(formatBar))) {
      parkFormatBar();
    }
    while (sourceText.lastChild instanceof HTMLBRElement) {
      sourceText.lastChild.remove();
    }
    const joinAt = targetText.textContent?.length ?? 0;
    if (visibleText(sourceText) === "") {
      source.remove();
      placeCaret(targetText, true);
      return;
    }

    while (sourceText.firstChild) {
      targetText.append(sourceText.firstChild);
    }
    source.remove();
    placeAtChar(targetText, joinAt);
  }

  /**
   * Стрелки и Backspace между отдельными contenteditable.
   * Пока каретка внутри строки, клавишу забирает браузер.
   *
   * @returns `true`, если событие обработано здесь.
   */
  function handleBlockMotion(event: KeyboardEvent, block: HTMLElement, text: HTMLElement): boolean {
    const key = event.key;
    const marked = markedBlocks();

    if (marked.length > 1 && !event.shiftKey) {
      if (key === "Backspace" || key === "Delete") {
        event.preventDefault();
        deleteMarked();
        timerSave();
        return true;
      }
      if (key.startsWith("Arrow")) {
        event.preventDefault();
        const toStart = key === "ArrowLeft" || key === "ArrowUp";
        const targetBlock = toStart ? marked[0] : marked[marked.length - 1];
        clearMarked();
        const host = targetBlock.querySelector<HTMLElement>("[data-block-text]");
        if (host) {
          placeCaret(host, !toStart);
        }
        return true;
      }
    }

    if (
      !event.shiftKey &&
      key === "Backspace" &&
      block.dataset.blockType === "text" &&
      collapsedIn(text) &&
      reachesEdge(text, true)
    ) {
      const previous = touchingTextBlock(block, -1);
      if (previous) {
        event.preventDefault();
        mergeBlocks(previous, block);
        timerSave();
        return true;
      }
    }

    if (!event.shiftKey && key === "Delete" && collapsedIn(text) && reachesEdge(text, false)) {
      const next = touchingTextBlock(block, 1);
      if (next) {
        event.preventDefault();
        mergeBlocks(block, next);
        timerSave();
        return true;
      }
    }

    if (!key.startsWith("Arrow")) {
      return false;
    }
    if (!event.shiftKey && !collapsedIn(text)) {
      return false;
    }

    const upward = key === "ArrowUp" || key === "ArrowLeft";
    const direction: 1 | -1 = upward ? -1 : 1;
    let cross = false;
    if (key === "ArrowLeft") {
      cross = reachesEdge(text, true);
    } else if (key === "ArrowRight") {
      cross = reachesEdge(text, false);
    } else if (key === "ArrowUp") {
      cross = onEdgeLine(text, "first");
    } else if (key === "ArrowDown") {
      cross = onEdgeLine(text, "last");
    }
    if (!cross) {
      return false;
    }

    if (event.shiftKey) {
      const anchor = markAnchor ?? block;
      const from = markFocus ?? block;
      const next = neighborTextBlock(from, direction);
      if (!next) {
        return false;
      }
      if (next === anchor) {
        event.preventDefault();
        clearMarked();
        const host = anchor.querySelector<HTMLElement>("[data-block-text]");
        if (host) {
          placeCaret(host, direction === 1);
        }
        return true;
      }
      if (!markRange(anchor, next, true)) {
        return false;
      }
      event.preventDefault();
      return true;
    }

    const next = neighborTextBlock(block, direction);
    if (!next) {
      return false;
    }
    event.preventDefault();
    clearMarked();
    const host = next.querySelector<HTMLElement>("[data-block-text]");
    if (!host) {
      return true;
    }
    if (key === "ArrowLeft") {
      placeCaret(host, true);
    } else if (key === "ArrowRight") {
      placeCaret(host, false);
    } else {
      moveCaretToBlock(next, caretX(text), key === "ArrowUp" ? "end" : "start");
    }
    return true;
  }

  /**
   * Текстовый блок под указателем, с небольшим допуском по вертикали.
   *
   * @param x Координата указателя.
   * @param y Координата указателя.
   * @returns Блок или `null`.
   */
  function blockAtPoint(x: number, y: number): HTMLElement | null {
    const node = document.elementFromPoint(x, y);
    if (node instanceof Element) {
      const direct = node.closest<HTMLElement>("[data-block]");
      if (direct && mainRegion.contains(direct) && direct.querySelector("[data-block-text]")) {
        return direct;
      }
    }
    let closest: HTMLElement | null = null;
    let best = 28;
    for (const block of textBlocks()) {
      const box = block.getBoundingClientRect();
      if (x < box.left - 48 || x > box.right + 48) {
        continue;
      }
      const distance = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
      if (distance < best) {
        best = distance;
        closest = block;
      }
    }
    return closest;
  }

  /**
   * Начинает выделение нескольких блоков, если нажатие пришлось на строку.
   *
   * @param event Нажатие указателя.
   */
  function onEditorPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      clearMarked();
      dragAnchor = null;
      return;
    }
    if (target.closest("[data-format-bar]")) {
      return;
    }
    if (!mainRegion.contains(target)) {
      clearMarked();
      dragAnchor = null;
      return;
    }
    if (target.closest("button, input, a")) {
      return;
    }
    const block = target.closest<HTMLElement>("[data-block]");
    if (!block?.querySelector("[data-block-text]")) {
      clearMarked();
      dragAnchor = null;
      return;
    }
    clearMarked();
    dragAnchor = block;
  }

  /**
   * Расширяет выделение блоков, пока кнопка зажата.
   *
   * @param event Движение указателя.
   */
  function onEditorPointerMove(event: PointerEvent): void {
    if (!dragAnchor || (event.buttons & 1) === 0) {
      return;
    }
    const block = blockAtPoint(event.clientX, event.clientY);
    if (!block || block === dragAnchor) {
      if (markedBlocks().length > 0) {
        clearMarked();
      }
      return;
    }
    markRange(dragAnchor, block, false);
  }

  /**
   * Заканчивает протяжку выделения.
   */
  function onEditorPointerUp(): void {
    if (dragAnchor && markAnchor && markFocus) {
      markRange(markAnchor, markFocus, true);
    }
    dragAnchor = null;
  }

  /**
   * Кладёт выделенные блоки в буфер одним текстом, строки разделяет переводом.
   *
   * @param event `copy` или `cut`.
   */
  function onEditorCopy(event: ClipboardEvent): void {
    const blocks = markedBlocks();
    if (blocks.length < 2 || !event.clipboardData) {
      return;
    }
    event.preventDefault();
    const payload = blocks
      .map((block) => {
        const text = block.querySelector<HTMLElement>("[data-block-text]");
        return text ? text.innerText.replace(/\n$/, "") : "";
      })
      .join("\n");
    event.clipboardData.setData("text/plain", payload);
    if (event.type === "cut") {
      deleteMarked();
      timerSave();
    }
  }

  /** Закрывает меню типа блока, сохраняя выделение текста. */
  function closeSelectionTypeMenu(): void {
    if (selectionTypeMenu) {
      selectionTypeMenu.hidden = true;
    }
    selectionTypeToggle?.setAttribute("aria-expanded", "false");
  }

  /** Открывает меню с той стороны панели, где больше свободного места. */
  function toggleSelectionTypeMenu(): void {
    if (!selectionTypeMenu || !selectionTypeToggle || !formatBar) {
      return;
    }
    if (!selectionTypeMenu.hidden) {
      closeSelectionTypeMenu();
      return;
    }

    const notebook = formatBar.closest<HTMLElement>(".notebook");
    if (!notebook) {
      return;
    }
    const gap = 6;
    const edgePadding = 8;
    const notebookRect = notebook.getBoundingClientRect();
    const toggleRect = selectionTypeToggle.getBoundingClientRect();
    const visibleTop = Math.max(0, notebookRect.top + notebook.clientTop) + edgePadding;
    const visibleBottom =
      Math.min(window.innerHeight, notebookRect.top + notebook.clientTop + notebook.clientHeight) -
      edgePadding;
    const spaceAbove = Math.max(0, toggleRect.top - visibleTop - gap);
    const spaceBelow = Math.max(0, visibleBottom - toggleRect.bottom - gap);
    const openAbove = spaceBelow < 320 && spaceAbove > spaceBelow;

    selectionTypeMenu.style.top = openAbove ? "auto" : `calc(100% + ${gap}px)`;
    selectionTypeMenu.style.bottom = openAbove ? `calc(100% + ${gap}px)` : "auto";
    selectionTypeMenu.style.maxHeight = `${Math.min(320, openAbove ? spaceAbove : spaceBelow)}px`;
    selectionTypeMenu.hidden = false;
    selectionTypeToggle.setAttribute("aria-expanded", "true");

    for (const item of selectionTypeMenu.querySelectorAll<HTMLElement>("[data-selection-type]")) {
      item.classList.toggle(
        "block-menu__item_active",
        item.getAttribute("aria-pressed") === "true"
      );
    }
  }

  /** Меняет тип выделенного абзаца без замены текста и его форматирования. */
  function changeSelectedBlockType(type: BlockType): void {
    closeSelectionTypeMenu();
    if (
      type === "file" ||
      type === "image" ||
      !BLOCK_OPTIONS.some((option) => option.type === type)
    ) {
      return;
    }
    const block = formatBar?.closest<HTMLElement>("[data-block]");
    const text = block?.querySelector<HTMLElement>("[data-block-text]");
    const selection = window.getSelection();
    if (!block || !text || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0).cloneRange();
    if (!text.contains(range.startContainer) || !text.contains(range.endContainer)) {
      return;
    }
    if (block.dataset.blockType === type) {
      return;
    }

    closeBlockMenu();
    block.classList.remove(`notebook__block_${block.dataset.blockType}`);
    block.classList.add(`notebook__block_${type}`);
    block.dataset.blockType = type;
    block.querySelector("[data-block-check]")?.remove();
    if (type === "checklist") {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "notebook__check";
      checkbox.dataset.blockCheck = "";
      text.before(checkbox);
    }

    text.focus();
    selection.removeAllRanges();
    selection.addRange(range);
    timerSave();
    placeFormatBar();
  }

  /**
   * Прячет панель форматирования вне строки, чтобы перерисовка её не уничтожила.
   */
  function parkFormatBar(): void {
    if (!formatBar) {
      return;
    }
    closeSelectionTypeMenu();
    formatBar.hidden = true;
    page.append(formatBar);
  }

  /** Применяет формат к выделенному тексту или ко всем выделенным блокам. */
  function applySelectionFormat(format: InlineFormat): void {
    const blocks = markedBlocks();
    if (blocks.length < 2) {
      applyInlineFormat(format);
      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const anchor = markAnchor ?? blocks[0];
    const focus = markFocus ?? blocks[blocks.length - 1];
    const selectBlock = (block: HTMLElement): void => {
      const text = block.querySelector<HTMLElement>("[data-block-text]");
      if (!text) {
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(text);
      text.focus({ preventScroll: true });
      selection.removeAllRanges();
      selection.addRange(range);
    };

    applyingInlineFormat = true;
    try {
      const states = blocks.map((block) => {
        selectBlock(block);
        return inlineFormatState(format);
      });
      const enable = !states.every(
        (state, index) => state || !blocks[index].querySelector("[data-block-text]")?.textContent
      );
      blocks.forEach((block, index) => {
        if (states[index] !== enable) {
          selectBlock(block);
          applyInlineFormat(format);
        }
      });
    } finally {
      applyingInlineFormat = false;
      markRange(anchor, focus, true);
    }
  }

  /**
   * Показывает панель форматирования над строкой с кареткой.
   */
  function placeFormatBar(): void {
    if (!formatBar) {
      return;
    }
    const marked = markedBlocks();
    const multiple = marked.length > 1;
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const host = anchor instanceof Element ? anchor : anchor?.parentElement;
    const text = multiple
      ? marked[0].querySelector<HTMLElement>("[data-block-text]")
      : host?.closest<HTMLElement>("[data-block-text]");
    const block = text?.closest<HTMLElement>("[data-block]");
    if (
      !selection ||
      selection.rangeCount === 0 ||
      !text ||
      !block ||
      !mainRegion.contains(text) ||
      (!multiple &&
        (selection.isCollapsed ||
          !text.contains(selection.getRangeAt(0).startContainer) ||
          !text.contains(selection.getRangeAt(0).endContainer)))
    ) {
      parkFormatBar();
      return;
    }

    if (multiple || formatBar.parentElement !== block) {
      closeSelectionTypeMenu();
    }
    if (formatBar.parentElement !== block) {
      block.append(formatBar);
    }
    const types = formatBar.querySelector<HTMLElement>(".format-bar__types");
    if (types) {
      types.hidden = multiple;
    }
    formatBar.hidden = false;
    const type = block.dataset.blockType;
    const label = formatBar.querySelector<HTMLElement>("[data-selection-type-label]");
    if (label) {
      label.textContent = BLOCK_OPTIONS.find((option) => option.type === type)?.label ?? "Текст";
    }
    for (const button of formatBar.querySelectorAll<HTMLButtonElement>("[data-selection-type]")) {
      button.setAttribute("aria-pressed", button.dataset.selectionType === type ? "true" : "false");
    }
    for (const button of formatBar.querySelectorAll<HTMLButtonElement>("[data-format]")) {
      const format = button.dataset.format as InlineFormat;
      button.setAttribute("aria-pressed", inlineFormatState(format) ? "true" : "false");
    }
  }

  /**
   * Обновляет панель форматирования, когда меняется выделение.
   */
  function onSelectionChange(): void {
    placeFormatBar();
  }

  /**
   * Не даёт кнопке панели забрать фокус у строки.
   *
   * @param event Нажатие на кнопку «Ж», «К», «Ч» или «А».
   */
  function onFormatMouseDown(event: MouseEvent): void {
    event.preventDefault();
  }
  return {
    markedBlocks,
    clearMarked,
    deleteMarked,
    handleBlockMotion,
    onEditorPointerDown,
    onEditorPointerMove,
    onEditorPointerUp,
    onEditorCopy,
    closeSelectionTypeMenu,
    toggleSelectionTypeMenu,
    changeSelectedBlockType,
    parkFormatBar,
    applySelectionFormat,
    placeFormatBar,
    onSelectionChange,
    onFormatMouseDown,
    isApplyingFormat: () => applyingInlineFormat,
  };
}
/** Выделение блоков и панель форматирования открытой заметки. */
export type EditorSelection = ReturnType<typeof createEditorSelection>;
