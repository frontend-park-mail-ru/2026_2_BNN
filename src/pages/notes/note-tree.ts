/** Поля заметки, по которым строится дерево. Остальное содержимое списку не нужно. */
interface NoteTreeSource {
  readonly id: string;
  readonly parentId: string | null;
  readonly title: string;
}

/** Узел дерева для шаблона списка: ссылка, заголовок и вложенные заметки. */
export interface NoteTreeItem {
  id: string;
  href: string;
  title: string;
  isActive: boolean;
  children: NoteTreeItem[];
}

/** Сколько уровней вложенности можно создать. Корень считается нулевым. */
export const MAX_NOTE_DEPTH = 9;

/**
 * Считает, насколько глубоко заметка вложена в родителей.
 * Цикл в цепочке родителей считается ошибкой данных.
 *
 * @param notes Заметки, среди которых ищем родителей.
 * @param noteId Идентификатор заметки.
 * @returns Глубина от корня или `null`, если заметки нет либо родители зациклены.
 */
export function getNoteDepth(notes: readonly NoteTreeSource[], noteId: string): number | null {
  const byId = new Map(notes.map((note) => [note.id, note] as const));
  const visited = new Set<string>();
  let current = byId.get(noteId);
  let depth = 0;

  while (current) {
    if (visited.has(current.id)) return null;
    if (current.parentId === null) return depth;

    visited.add(current.id);
    current = byId.get(current.parentId);
    depth++;
  }

  return null;
}

/**
 * Собирает плоский список заметок в дерево по `parentId`.
 * Заметка без родителя или с неизвестным родителем становится корнем.
 *
 * @param notes Заметки в порядке store.
 * @param activeId Идентификатор открытой заметки. Её пункт помечается активным.
 * @param basePath Начало адреса пункта: `/notes/all` или `/notes/favorites`.
 * @returns Корневые узлы. Дети лежат в `children` в том же порядке, что и исходный список.
 */
export function buildNoteTree(
  notes: readonly NoteTreeSource[],
  activeId: string | undefined,
  basePath = "/notes"
): NoteTreeItem[] {
  const byId = new Map<string, NoteTreeItem>();
  const roots: NoteTreeItem[] = [];

  for (const note of notes) {
    byId.set(note.id, {
      id: note.id,
      href: `${basePath}/${encodeURIComponent(note.id)}`,
      title: note.title || "Без названия",
      isActive: note.id === activeId,
      children: [],
    });
  }

  for (const note of notes) {
    const item = byId.get(note.id)!;
    const parent = note.parentId ? byId.get(note.parentId) : undefined;

    if (parent && parent !== item) {
      parent.children.push(item);
    } else {
      roots.push(item);
    }
  }

  return roots;
}

/**
 * Оставляет в дереве заметки из набора и поднимает их детей, если сам узел скрыт.
 *
 * @param nodes Узлы текущего уровня.
 * @param visibleIds Идентификаторы заметок, которые проходят фильтр.
 * @returns Узлы, которые нужно показать.
 */
export function filterNoteTree(
  nodes: NoteTreeItem[],
  visibleIds: ReadonlySet<string>
): NoteTreeItem[] {
  return nodes.flatMap((node) => {
    const children = filterNoteTree(node.children, visibleIds);
    return visibleIds.has(node.id) ? [{ ...node, children }] : children;
  });
}
