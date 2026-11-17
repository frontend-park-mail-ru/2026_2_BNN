/** Как вставить распознанный текст в текущий блок редактора. */
interface VoiceInputViewOptions {
  mainRegion: HTMLElement;
  insertBlockAfter(block: HTMLElement, type: "text"): HTMLElement | null;
  placeCaret(element: HTMLElement, atEnd: boolean): void;
}

/**
 * Вставляет промежуточный и окончательный текст диктовки в contenteditable.
 *
 * @param options Контейнер заметки и команды редактора для нового блока и каретки.
 * @returns Вставка фразы и переключение индикатора записи.
 */
export function createVoiceInputView(options: VoiceInputViewOptions) {
  const { mainRegion, insertBlockAfter, placeCaret } = options;

  /**
   * Ищет редактируемый заголовок или текст блока, внутри которого лежит узел.
   *
   * @param node Узел каретки или вставленного текста.
   * @returns Поле заметки или `null`, если узел вне редактора.
   */
  function findEditable(node: Node | null): HTMLElement | null {
    const element = node instanceof Element ? node : (node?.parentElement ?? null);
    const editable = element?.closest<HTMLElement>("[data-note-title], [data-block-text]") ?? null;
    return editable && mainRegion.contains(editable) ? editable : null;
  }

  /** Место вставки надиктованного текста: каретка в заметке или конец последнего блока. */
  function getVoiceInputRange(): Range | null {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const editable = findEditable(range.startContainer);
      if (editable && editable === findEditable(range.endContainer)) {
        return range;
      }
    }

    const texts = mainRegion.querySelectorAll<HTMLElement>("[data-block-text]");
    const blocks = mainRegion.querySelectorAll<HTMLElement>("[data-block]");
    const lastBlock = blocks[blocks.length - 1];
    const text =
      texts[texts.length - 1] ?? (lastBlock ? insertBlockAfter(lastBlock, "text") : null);
    if (!text) {
      return null;
    }

    placeCaret(text, true);
    return window.getSelection()?.getRangeAt(0) ?? null;
  }

  /**
   * Проверяет, нужен ли пробел перед надиктованной фразой.
   *
   * @param editable Поле, в которое вставляем текст.
   * @param range Место вставки.
   * @returns `true`, если перед кареткой есть символ и это не пробел.
   */
  function needsSpaceBefore(editable: HTMLElement, range: Range): boolean {
    const before = document.createRange();
    before.selectNodeContents(editable);
    before.setEnd(range.startContainer, range.startOffset);
    const preceding = before.toString();
    return preceding !== "" && !/\s$/.test(preceding);
  }

  /**
   * Ставит каретку в переданный диапазон.
   *
   * @param range Уже подготовленное место каретки.
   */
  function placeCaretAt(range: Range): void {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  /**
   * Находит узел промежуточной фразы, которая ещё не попала в текст заметки.
   *
   * @returns Узел или `null`, если диктовка ещё ничего не показала.
   */
  function findInterim(): HTMLElement | null {
    return mainRegion.querySelector<HTMLElement>("[data-voice-input-interim]");
  }

  /** Убирает промежуточную фразу из заметки. */
  function removeInterim(): void {
    findInterim()?.remove();
  }

  /**
   * Показывает недоговорённую фразу прямо в тексте заметки.
   * Текст выводится через `::after`, поэтому не попадает в содержимое блока и в сохранение.
   */
  function showInterim(phrase: string): void {
    const words = phrase.trim();
    if (!words) {
      removeInterim();
      return;
    }

    let interim = findInterim();
    if (!interim) {
      const range = getVoiceInputRange();
      if (!range || !findEditable(range.startContainer)) {
        return;
      }
      range.collapse(false);
      interim = document.createElement("span");
      interim.className = "notebook__voice-input-interim";
      interim.contentEditable = "false";
      range.insertNode(interim);

      const caret = document.createRange();
      caret.setStartBefore(interim);
      caret.collapse(true);
      placeCaretAt(caret);
    }

    const editable = findEditable(interim);
    const position = document.createRange();
    position.setStartBefore(interim);
    const space = editable && needsSpaceBefore(editable, position) ? " " : "";
    interim.dataset.voiceInputInterim = space + words;
  }

  /**
   * Вставляет законченную фразу в текст заметки и ставит каретку после неё.
   *
   * @param phrase Текст, который вернул распознаватель.
   */
  function insertVoiceInputText(phrase: string): void {
    const words = phrase.trim();
    const interim = findInterim();
    let range: Range | null = null;

    if (interim) {
      range = document.createRange();
      range.setStartBefore(interim);
      range.collapse(true);
      interim.remove();
    } else if (words) {
      range = getVoiceInputRange();
    }

    const editable = range ? findEditable(range.startContainer) : null;
    if (!words || !range || !editable) {
      return;
    }

    range.deleteContents();
    const space = needsSpaceBefore(editable, range) ? " " : "";
    const node = document.createTextNode(space + words);
    range.insertNode(node);

    const caret = document.createRange();
    caret.setStartAfter(node);
    caret.collapse(true);
    placeCaretAt(caret);

    editable.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /**
   * Включает или выключает вид кнопки микрофона.
   *
   * @param active `true`, пока идёт запись.
   */
  function setVoiceInputActive(active: boolean): void {
    const button = mainRegion.querySelector<HTMLElement>("[data-voice-input-toggle]");

    if (button) {
      const label = active ? "Остановить голосовой ввод" : "Голосовой ввод";

      button.classList.toggle("icon-button_recording", active);
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-label", label);
      button.title = label;
    }

    const status = mainRegion.querySelector<HTMLElement>("[data-voice-input-status]");

    if (status) {
      status.hidden = !active;
      status.textContent = active ? "Говорите…" : "";
    }

    if (!active) {
      removeInterim();
    }
  }

  return { showInterim, insertVoiceInputText, setVoiceInputActive };
}
