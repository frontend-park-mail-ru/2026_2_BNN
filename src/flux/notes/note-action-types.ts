import type { NoteBlock } from "@/types/note";
import type { Tag } from "@/types/tag";

/** Заметка в store: список API не всегда содержит блоки и теги. */
export interface NoteStateItem {
  id: string;
  parentId: string | null;
  title: string;
  blocks: NoteBlock[];
  isLoaded: boolean;
  text: string;
  tags: Tag[];
  tagsLoaded: boolean;
}

/** Статус загрузки списка заметок. */
export type NotesStatus = "idle" | "loading" | "ready" | "error" | "unauthorized";
/** Статус автосохранения открытой заметки. */
export type SaveStatus = "idle" | "saving" | "saved" | "error";
/** Почему не удалось загрузить список или одну заметку. */
export type LoadError = "offline" | "unauthorized" | "missing" | "server";
/** Состояние запроса одной заметки. Хранится отдельно от списка. */
export interface NoteLoadState {
  status: "loading" | "ready" | "error";
  error: LoadError | null;
}
/** Статус догрузки тел заметок для поиска и фильтра по тегам. */
export type DetailsStatus = "idle" | "loading" | "ready" | "error";

/** Действия списка, одной заметки, сохранения и догрузки деталей. */
export type NoteAction =
  | { type: "notes/favorites-loading" }
  | { type: "notes/favorites-loaded"; ids: string[] }
  | { type: "notes/favorites-failed" }
  | { type: "notes/favorite-pending"; id: string }
  | { type: "notes/favorite-finished"; id: string; favorite?: boolean }
  | { type: "notes/save-status-changed"; status: SaveStatus }
  | { type: "notes/loading" }
  | { type: "notes/loaded"; notes: NoteStateItem[] }
  | { type: "notes/load-failed"; error: LoadError }
  | { type: "notes/note-loading"; id: string }
  | { type: "notes/note-loaded"; id: string; note: NoteStateItem | null }
  | { type: "notes/note-load-failed"; id: string; error: LoadError }
  | { type: "notes/details-status-changed"; status: DetailsStatus }
  | { type: "notes/updated"; note: NoteStateItem }
  | { type: "notes/deleted"; id: string };
