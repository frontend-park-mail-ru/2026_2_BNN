/**
 * Текст строки без хвостового переноса, который добавляет contenteditable.
 *
 * @param text Узел `[data-block-text]`.
 * @returns Видимый текст.
 */
export function visibleText(text: HTMLElement): string {
  return text.innerText.replaceAll("\u00a0", " ").trim();
}

/**
 * Каретка стоит в начале или в конце текста блока.
 *
 * @param text Текстовый узел блока.
 * @param atStart Проверять начало, а не конец.
 * @returns `true`, если в эту сторону текст уже кончился.
 */
export function reachesEdge(text: HTMLElement, atStart: boolean): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }
  const range = selection.getRangeAt(0);
  if (!text.contains(range.startContainer) || !text.contains(range.endContainer)) {
    return false;
  }
  const probe = document.createRange();
  probe.selectNodeContents(text);
  try {
    if (atStart) {
      probe.setEnd(range.startContainer, range.startOffset);
    } else {
      probe.setStart(range.endContainer, range.endOffset);
    }
  } catch {
    return false;
  }
  return probe.toString() === "";
}

/**
 * Выделение схлопнуто и находится внутри этой строки.
 *
 * @param text Узел `[data-block-text]`.
 * @returns `true`, если каретка в этой строке.
 */
export function collapsedIn(text: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
    return false;
  }
  return text.contains(selection.getRangeAt(0).startContainer);
}

/**
 * Прямоугольник диапазона.
 *
 * @param range Диапазон каретки.
 * @returns Прямоугольник или `null`, если его нет на экране.
 */
export function rangeRect(range: Range): DOMRect | null {
  const rects = range.getClientRects();
  for (let i = rects.length - 1; i >= 0; i -= 1) {
    if (rects[i].height > 0) {
      return rects[i];
    }
  }
  return null;
}

/**
 * Прямоугольник конца узла. Нужен, когда у пустой каретки нет своей ширины.
 *
 * @param node Текстовый узел или элемент строки.
 * @returns Прямоугольник или `null`.
 */
export function rectAtEnd(node: Node): DOMRect | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = node.textContent ?? "";
    if (value.length === 0) {
      return null;
    }
    const range = document.createRange();
    range.setStart(node, value.length - 1);
    range.setEnd(node, value.length);
    return rangeRect(range);
  }
  if (node instanceof HTMLElement && node.lastChild) {
    return rectAtEnd(node.lastChild);
  }
  return null;
}

/**
 * Прямоугольник каретки в строке.
 *
 * @param text Узел `[data-block-text]`.
 * @returns Прямоугольник каретки или конца предыдущего символа.
 */
export function focusRect(text: HTMLElement): DOMRect | null {
  const selection = window.getSelection();
  const node = selection?.focusNode;
  if (!selection || !node || !text.contains(node)) {
    return null;
  }
  const range = document.createRange();
  try {
    range.setStart(node, selection.focusOffset);
    range.collapse(true);
  } catch {
    return null;
  }
  const direct = rangeRect(range);
  if (direct) {
    return direct;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    const value = node.textContent ?? "";
    const offset = selection.focusOffset;
    if (offset < value.length) {
      range.setEnd(node, offset + 1);
      const next = rangeRect(range);
      if (next) {
        return next;
      }
    }
    if (offset > 0) {
      range.setStart(node, offset - 1);
      range.collapse(false);
      const previous = rangeRect(range);
      if (previous) {
        return previous;
      }
    }
  }
  if (node instanceof HTMLElement) {
    const before = node.childNodes[selection.focusOffset - 1];
    if (before) {
      const previous = rectAtEnd(before);
      if (previous) {
        return previous;
      }
    }
  }
  const box = text.getBoundingClientRect();
  return box.height > 0 ? box : null;
}

/**
 * Каретка на первой или последней визуальной строке блока.
 *
 * @param text Узел `[data-block-text]`.
 * @param edge `"first"` или `"last"`.
 * @returns `true`, если стрелка должна перейти в соседний блок.
 */
export function onEdgeLine(text: HTMLElement, edge: "first" | "last"): boolean {
  const rect = focusRect(text);
  if (!rect) {
    return true;
  }
  const box = text.getBoundingClientRect();
  const slack = Math.max(rect.height, 8) * 0.65;
  if (edge === "first") {
    return rect.top - box.top <= slack;
  }
  return box.bottom - rect.bottom <= slack;
}

/**
 * Горизонталь каретки, чтобы попасть в тот же столбец соседней строки.
 *
 * @param text Текущая строка.
 * @returns Координата `clientX`.
 */
export function caretX(text: HTMLElement): number {
  const rect = focusRect(text);
  if (!rect) {
    return text.getBoundingClientRect().left;
  }
  const line = text.getBoundingClientRect().width;
  if (rect.width < 2 || rect.width > line * 0.8) {
    return rect.left;
  }
  return rect.right - 1;
}

/**
 * Ставит каретку в точку экрана внутри строки.
 *
 * @param text Целевая строка.
 * @param x Горизонталь.
 * @param y Вертикаль.
 * @returns `false`, если браузер не умеет ставить каретку по точке.
 */
export function placeCaretAtClient(text: HTMLElement, x: number, y: number): boolean {
  let range: Range | null = null;
  if (typeof document.caretRangeFromPoint === "function") {
    range = document.caretRangeFromPoint(x, y);
  }
  if ((!range || !text.contains(range.startContainer)) && document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    if (position && text.contains(position.offsetNode)) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    }
  }
  if (!range || !text.contains(range.startContainer)) {
    return false;
  }
  text.focus();
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return true;
}

/**
 * Ставит каретку на символ с этим индексом в `textContent`.
 *
 * @param text Строка.
 * @param index Индекс символа. Большой индекс ставит каретку в конец.
 */
export function placeAtChar(text: HTMLElement, index: number): void {
  const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
  let remaining = index;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      text.focus();
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  placeCaret(text, true);
}

/**
 * Переносит каретку в другой текстовый блок, сохраняя горизонталь.
 *
 * @param block Целевой блок.
 * @param x Горизонталь с предыдущей строки.
 * @param edge `"start"` или `"end"`, если точку поставить нельзя.
 */
export function moveCaretToBlock(block: HTMLElement, x: number, edge: "start" | "end"): void {
  const text = block.querySelector<HTMLElement>("[data-block-text]");
  if (!text) {
    return;
  }
  const box = text.getBoundingClientRect();
  const y = edge === "start" ? box.top + 4 : Math.max(box.top + 1, box.bottom - 4);
  if (!placeCaretAtClient(text, x, y)) {
    placeCaret(text, edge === "end");
  }
}

/**
 * Ставит каретку в начало или конец строки.
 *
 * @param element Узел `[data-block-text]`.
 * @param atEnd Ставить в конец.
 */
export function placeCaret(element: HTMLElement, atEnd: boolean): void {
  element.focus();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(!atEnd);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/**
 * Вырезает содержимое строки после каретки.
 *
 * @param text Текущая строка.
 * @returns Фрагмент или `null`, если после каретки пусто.
 */
export function cutAfterCaret(text: HTMLElement): DocumentFragment | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!text.contains(range.startContainer) || !text.contains(range.endContainer)) {
    return null;
  }

  range.deleteContents();
  const tail = document.createRange();
  tail.selectNodeContents(text);
  tail.setStart(range.startContainer, range.startOffset);
  return tail.extractContents();
}
