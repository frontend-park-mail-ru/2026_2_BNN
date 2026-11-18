import type { SaveStatus } from "../../../flux/notes/note-action-types";
import type { BlockType } from "../../../types/note";

/** Пауза после ввода, через которую заметка сохраняется, в миллисекундах. */
export const SAVE_DELAY = 1000;

/** Максимальная длина заголовка заметки. */
export const TITLE_MAX_LENGTH = 255;

/** Типы блоков, которые ведут себя как пункт списка. */
export const LIST_TYPES: BlockType[] = ["bulleted", "numbered", "checklist"];

/** Пункты меню выбора типа блока. */
export const BLOCK_OPTIONS: Array<{ type: BlockType; label: string }> = [
  { type: "subnote", label: "Подзаметка" },
  { type: "text", label: "Текст" },
  { type: "heading", label: "Заголовок" },
  { type: "subtitle", label: "Подзаголовок" },
  { type: "bulleted", label: "Маркированный список" },
  { type: "numbered", label: "Нумерованный список" },
  { type: "checklist", label: "Чек-лист" },
  { type: "quote", label: "Цитата" },
  { type: "file", label: "Файл" },
  { type: "image", label: "Изображение" },
];

/** Подпись статуса автосохранения в шаблоне заметки. */
export const SAVE_STATUS: Record<SaveStatus, string> = {
  idle: "",
  saving: "Сохраняется…",
  saved: "Сохранено",
  error: "Не сохранено",
};
