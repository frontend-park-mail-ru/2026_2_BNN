import { tagStore } from "@/flux/tags/tag-store";
import { notesStore } from "@/flux/notes/note-store";
import type { NoteStateItem as Note } from "@/flux/notes/note-action-types";
import type { ReadonlyState } from "@/flux/base-store";
import type { Tag } from "@/types/tag";

/**
 * Возвращает копию справочника тегов.
 *
 * @returns Теги в порядке store.
 */
export function getTags(): Tag[] {
  return [...tagStore.getState().tags];
}

/**
 * Возвращает теги, выбранные в фильтре списка.
 *
 * @returns Идентификаторы активных тегов.
 */
export function getActiveTagIds(): readonly string[] {
  return tagStore.getState().activeIds;
}

/**
 * Собирает теги по id, подставляя актуальные название и цвет из общего списка.
 *
 * @param ids Идентификаторы тегов.
 * @param fallback Теги заметки на случай, если общего списка нет.
 * @returns Теги в том же порядке.
 */
export function tagsByIds(ids: readonly string[], fallback: readonly Tag[]): Tag[] {
  const result: Tag[] = [];
  for (const id of ids) {
    const tag = getTags().find((item) => item.id === id) ?? fallback.find((item) => item.id === id);
    if (tag) {
      result.push(tag);
    }
  }
  return result;
}

/**
 * Ищет заметку по id в коллекции.
 *
 * @param notes Коллекция заметок.
 * @param id Идентификатор заметки из route params или parentId.
 * @returns Найденная заметка или `null`.
 */
export function findNote(
  notes: readonly ReadonlyState<Note>[],
  id: string | null | undefined
): ReadonlyState<Note> | null {
  if (!id) {
    return null;
  }

  for (const note of notes) {
    if (note.id === id) {
      return note;
    }
  }

  return null;
}
/**
 * Ищет заметку в текущем списке store.
 *
 * @param id Идентификатор заметки.
 * @returns Заметка или `null`.
 */
export function getNote(id: string | null | undefined) {
  return findNote(notesStore.getState().notes, id);
}
