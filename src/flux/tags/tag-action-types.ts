import type { Tag } from "@/types/tag";

/** Действия справочника тегов и фильтра списка заметок. */
export type TagAction =
  | { type: "tags/loaded"; tags: Tag[] }
  | { type: "tags/saved"; tag: Tag }
  | { type: "tags/deleted"; id: string }
  | { type: "tags/filter-toggled"; id: string }
  | { type: "tags/filter-replaced"; ids: string[] };
