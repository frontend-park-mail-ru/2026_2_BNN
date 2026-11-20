import type { BlockType, NoteBlock } from "@/types/note";
import { safeResourceUrl } from "@/utils/url";
import { formatFileMeta } from "@/pages/notes/attachments";

/** Блок заметки в виде, который ждёт шаблон редактора. */
export interface BlockView {
  isCard: boolean;
  id: string;
  type: BlockType;
  text: string;
  checked: boolean;
  isChecklist: boolean;
  isAttachment: boolean;
  isImage: boolean;
  isFileCard: boolean;
  fileMeta: string;
  url: string;
  contentJson: string;
  isUploading: boolean;
  uploadError: string;
  isSubnote: boolean;
  childNoteId: string;
  childNoteTitle: string;
  childNoteHref: string;
}

/**
 * Готовит один блок к отрисовке: флаги типа, безопасный адрес файла и подпись.
 *
 * @param block Блок из store или черновика.
 * @returns Данные для шаблона блока.
 */
export function toBlockView(block: NoteBlock): BlockView {
  const isAttachment = block.content.type === "file" || block.content.type === "image";
  const url = safeResourceUrl(block.content.url ?? "");
  const childNoteId = block.content.childNoteId ?? "";
  const isSubnote = block.content.type === "subnote" && childNoteId !== "";
  return {
    id: block.id,
    type: block.content.type,
    text: block.content.text,
    checked: block.content.checked === true,
    isChecklist: block.content.type === "checklist",
    isAttachment: isAttachment,
    isImage: block.content.type === "image",
    isFileCard: block.content.type === "file" && url !== "",
    fileMeta: isAttachment ? formatFileMeta(block.content.text, block.content.size) : "",
    url: url,
    contentJson: isAttachment ? JSON.stringify(block.content) : "",
    isUploading: false,
    uploadError: isAttachment && !url ? "Файл не загружен" : "",
    isSubnote,
    isCard: isAttachment || isSubnote,
    childNoteId,
    childNoteHref: isSubnote ? `/notes/${encodeURIComponent(childNoteId)}` : "",
    childNoteTitle: isSubnote ? getNote(childNoteId)?.title || "Без названия" : "",
  };
}

/**
 * Раскладывает блоки заметки по строкам редактора.
 * Многострочный текст становится несколькими блоками, пустой хвост отбрасывается,
 * а в конце остаётся пустая строка, если заметка кончается вложением.
 *
 * @param note Заметка с блоками.
 * @returns Блоки для шаблона редактора.
 */
export function getEditorBlocks(note: { blocks: readonly NoteBlock[] }): BlockView[] {
  const blocks: BlockView[] = [];
  for (const block of note.blocks) {
    const isAttachment = block.content.type === "file" || block.content.type === "image";
    if (isAttachment || !block.content.text.includes("\n")) {
      blocks.push(toBlockView(block));
      continue;
    }

    const lines = block.content.text.replaceAll("\r\n", "\n").replace(/\n$/, "").split("\n");
    for (let index = 0; index < lines.length; index++) {
      blocks.push(
        toBlockView({
          id: index === 0 ? block.id : "",
          content: { ...block.content, text: lines[index] },
        })
      );
    }
  }

  while (blocks.length > 0) {
    const tail = blocks[blocks.length - 1];
    if (tail.isAttachment || tail.isChecklist || tail.isSubnote || tail.text !== "") {
      break;
    }
    blocks.pop();
  }

  const last = blocks[blocks.length - 1];
  if (!last || last.isAttachment || last.isSubnote) {
    blocks.push(toBlockView({ id: "", content: { type: "text", text: "" } }));
  }

  return blocks;
}
