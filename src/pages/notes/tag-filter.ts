import type { Tag } from "../../types/tag";

/**
 * Проверяет, что у заметки есть все выбранные теги.
 *
 * @param noteTags Теги заметки.
 * @param activeTagIds Теги фильтра. Пустой список пропускает любую заметку.
 * @returns `true`, если заметка проходит фильтр.
 */
export function matchesTagFilter(
  noteTags: readonly Tag[],
  activeTagIds: readonly string[]
): boolean {
  return activeTagIds.every((id) => noteTags.some((tag) => tag.id === id));
}
