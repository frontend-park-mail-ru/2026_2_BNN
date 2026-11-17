import type { Tag } from "./tag";

/** Тип содержимого блока заметки. */
export type BlockType =
  | "text"
  | "heading"
  | "subtitle"
  | "bulleted"
  | "numbered"
  | "checklist"
  | "quote"
  | "file"
  | "image";

/** Содержимое блока заметки. */
export interface BlockContent {
  type: BlockType;
  text: string;
  checked?: boolean;
  attachmentId?: string;
  url?: string;
  size?: number;
}

/** Блок заметки с идентификатором. */
export interface NoteBlock {
  id: string;
  content: BlockContent;
}

/** Блок, который клиент отправляет при сохранении заметки. */
export interface BlockInput {
  id?: string;
  content: BlockContent;
}

/** Заметка в формате ответа бэкенда. */
export interface Note {
  id: string;
  parent_note_id?: string | null;
  title: string;
  blocks?: NoteBlock[];
  /** Есть только в ответах на одну заметку. */
  tags?: Tag[];
  created_at: string;
  updated_at: string;
}
