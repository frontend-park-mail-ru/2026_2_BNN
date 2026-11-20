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

export const MAX_NOTE_DEPTH = 9;

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
 * @returns Корневые узлы. Дети лежат в `children` в том же порядке, что и исходный список.
 */
export function buildNoteTree(
  notes: readonly NoteTreeSource[],
  activeId: string | undefined
): NoteTreeItem[] {
  const byId = new Map<string, NoteTreeItem>();
  const roots: NoteTreeItem[] = [];

  for (const note of notes) {
    byId.set(note.id, {
      id: note.id,
      href: `/notes/${encodeURIComponent(note.id)}`,
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
