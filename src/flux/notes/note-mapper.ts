import type { Note as ApiNote } from "@/types/note";
import type { NoteStateItem as Note } from "@/flux/notes/note-action-types";

/**
 * Приводит заметку API к формату, удобному для UI.
 *
 * @param note Исходная заметка из API.
 * @returns Заметка для шаблонов и поиска.
 */
export function normalizeNote(note: ApiNote): Note {
  const title = note.title;
  const blocks = note.blocks ?? [];

  return {
    id: note.id,
    parentId: note.parent_note_id ?? null,
    title: title,
    blocks: blocks,
    isLoaded: Array.isArray(note.blocks),
    text: blocks.map((block) => block.content.text).join(" "),
    tags: note.tags ?? [],
    tagsLoaded: Array.isArray(note.blocks) || Array.isArray(note.tags),
  };
}
