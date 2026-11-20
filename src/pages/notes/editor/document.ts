import type { BlockContent, BlockInput, BlockType, NoteBlock } from "@/types/note";
import { toBlockView, type BlockView } from "@/pages/notes/editor/block-view";
import { TITLE_MAX_LENGTH } from "@/pages/notes/editor/constants";
import { renderInlineHtml, serializeInline } from "@/pages/notes/editor/inline-format";
/**
 * Читает и меняет блоки в DOM редактора, не обращаясь к сети.
 *
 * @param mainRegion Контейнер открытой заметки.
 * @param beforeReplace Вызывается до замены блока, чтобы снять с него выделение.
 * @returns Операции чтения и замены блоков.
 */
export function createEditorDocument(
  mainRegion: HTMLElement,
  beforeReplace: (block: HTMLElement) => void
) {
  /**
   * Читает заголовок из contenteditable.
   *
   * @returns Текст заголовка. Пустой заголовок остаётся пустой строкой.
   */
  function readTitle(): string {
    const title = mainRegion.querySelector<HTMLElement>("[data-note-title]");
    return Array.from((title?.textContent ?? "").trim())
      .slice(0, TITLE_MAX_LENGTH)
      .join("");
  }

  /** Текст блока без хвостового переноса, который contenteditable добавляет сам. */
  function blockText(element: HTMLElement): string {
    const text = element.querySelector<HTMLElement>("[data-block-text]");
    if (!text) {
      return "";
    }
    return serializeInline(text).replaceAll("\r\n", "\n");
  }

  /**
   * Раскладывает переносы внутри одного блока на отдельные блоки.
   * Иначе при следующем открытии contenteditable склеивает строки.
   */
  function expandNewlines(block: HTMLElement): void {
    const textElement = block.querySelector<HTMLElement>("[data-block-text]");
    if (!textElement) {
      return;
    }

    const text = blockText(block);
    if (!text.includes("\n")) {
      return;
    }

    const lines = text.split("\n");
    textElement.innerHTML = renderInlineHtml(lines[0]);
    const type = (block.dataset.blockType as BlockType) || "text";
    let previous = block;
    for (const line of lines.slice(1)) {
      const created = insertBlockAfter(previous, type);
      if (!created) {
        return;
      }
      created.innerHTML = renderInlineHtml(line);
      previous = created.closest<HTMLElement>("[data-block]") ?? previous;
    }
  }

  /**
   * Собирает содержимое одного блока для API.
   *
   * @param element Узел `[data-block]`.
   * @returns Содержимое или `null`, если блок разобрать нельзя.
   */
  function readBlock(element: HTMLElement): BlockContent | null {
    if (element.dataset.content) {
      try {
        return JSON.parse(element.dataset.content) as BlockContent;
      } catch {
        return null;
      }
    }

    if (element.dataset.blockType === "subnote") {
      const link = element.querySelector<HTMLElement>("[data-child-note-id]");
      const childNoteId = link?.dataset.childNoteId;

      if (childNoteId) {
        return { type: "subnote", text: "", childNoteId };
      }
    }

    const text = blockText(element);
    const check = element.querySelector<HTMLInputElement>("[data-block-check]");
    const content: BlockContent = { type: element.dataset.blockType as BlockType, text };
    if (check) {
      content.checked = check.checked;
    }
    return content;
  }

  /**
   * Собирает блоки заметки. Пустые строки после последнего текста в сохранение не попадают.
   *
   * @returns Элементы, тела блоков и элементы, которым не нужно писать id.
   */
  function collectBlocks(): {
    elements: HTMLElement[];
    blocks: BlockInput[];
    skipped: HTMLElement[];
  } {
    const elements: HTMLElement[] = [];
    const blocks: BlockInput[] = [];
    const skipped: HTMLElement[] = [];
    const current = Array.from(mainRegion.querySelectorAll<HTMLElement>("[data-block]"));

    for (const element of current) {
      expandNewlines(element);
    }

    for (const element of mainRegion.querySelectorAll<HTMLElement>("[data-block]")) {
      const content = readBlock(element);
      if (!content) {
        skipped.push(element);
        continue;
      }

      const id = element.dataset.blockId;
      elements.push(element);
      blocks.push(id ? { id, content } : { content });
    }

    while (blocks.length > 0) {
      const tail = blocks[blocks.length - 1];
      const isBlankLine =
        tail.content.text === "" &&
        tail.content.checked === undefined &&
        tail.content.type !== "file" &&
        tail.content.type !== "image" &&
        !tail.content.childNoteId;
      if (!isBlankLine) {
        break;
      }
      blocks.pop();
      const dropped = elements.pop();
      if (dropped) {
        skipped.push(dropped);
      }
    }

    return { elements, blocks, skipped };
  }

  /**
   * Записывает в DOM id, которые сервер выдал новым блокам. Пропущенные элементы id теряют.
   *
   * @param elements Блоки, ушедшие в запрос, в том же порядке.
   * @param saved Блоки из ответа сервера.
   */
  function applyBlockIds(elements: HTMLElement[], saved: NoteBlock[]): void {
    for (let i = 0; i < elements.length && i < saved.length; i++) {
      elements[i].dataset.blockId = saved[i].id;
    }
  }

  /**
   * Вставляет новый блок следом за текущим.
   *
   * @param block Опорный блок.
   * @param type Тип нового блока.
   * @returns Новый блок или `null`, если разметку собрать нельзя.
   */
  function insertBlockAfter(block: HTMLElement, type: BlockType): HTMLElement | null {
    const view = toBlockView({ id: "", content: { type, text: "" } });
    block.insertAdjacentHTML("afterend", Handlebars.partials["note-block"](view));
    return block.nextElementSibling?.querySelector<HTMLElement>("[data-block-text]") ?? null;
  }

  /**
   * Подменяет разметку блока и возвращает новый узел.
   *
   * @param block Старый блок.
   * @param view Данные для шаблона `note-block`.
   * @returns Вставленный блок.
   */
  function replaceBlock(block: HTMLElement, view: BlockView): HTMLElement {
    beforeReplace(block);
    block.insertAdjacentHTML("afterend", Handlebars.partials["note-block"](view));
    const next = block.nextElementSibling as HTMLElement;
    block.remove();
    return next;
  }
  return {
    readTitle,
    readBlock,
    collectBlocks,
    applyBlockIds,
    insertBlockAfter,
    replaceBlock,
  };
}
/** Операции над DOM открытой заметки. */
export type EditorDocument = ReturnType<typeof createEditorDocument>;
