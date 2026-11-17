import type { Tag } from "../../types/tag";

/** Поля заметки, по которым ищет строка поиска. */
interface SearchableNote {
  title: string;
  text: string;
  tags: readonly Tag[];
}

/**
 * Отделяет префикс `#`: такой запрос ищет только по названиям тегов.
 *
 * @param query Строка из поля поиска.
 * @returns Нормализованный текст и признак поиска только по тегам.
 */
function parseSearch(query: string): { search: string; onlyTags: boolean } {
  const search = query.trim().toLowerCase();

  if (search.startsWith("#")) {
    return { search: search.slice(1).trim(), onlyTags: true };
  }

  return { search, onlyTags: false };
}

/**
 * Оставляет заметки, у которых запрос встречается в заголовке, тексте или теге.
 *
 * @param notes Заметки, среди которых ищем.
 * @param query Строка поиска. Префикс `#` ограничивает поиск тегами.
 * @returns Подходящие заметки в исходном порядке.
 */
export function filterNotes<T extends SearchableNote>(
  notes: readonly T[],
  query: string
): readonly T[] {
  const { search, onlyTags } = parseSearch(query);

  if (search === "") {
    return onlyTags ? notes.filter((note) => note.tags.length > 0) : notes;
  }

  const result: T[] = [];

  for (const note of notes) {
    const tagMatch = note.tags.some((tag) => tag.name.toLowerCase().includes(search));
    const noteText = (note.title + " " + note.text).toLowerCase();

    if (tagMatch || (!onlyTags && noteText.includes(search))) {
      result.push(note);
    }
  }

  return result;
}

/**
 * Оставляет теги, в названии которых есть запрос.
 *
 * @param tags Справочник тегов.
 * @param query Строка поиска.
 * @returns Подходящие теги. Пустой запрос не возвращает ничего.
 */
export function filterTags(tags: Tag[], query: string): Tag[] {
  const { search } = parseSearch(query);

  if (search === "") {
    return [];
  }

  return tags.filter((tag) => tag.name.toLowerCase().includes(search));
}
