import { ApiError } from "@/api";
import * as noteActions from "@/flux/notes/note-actions";
import { createAutosave } from "@/pages/notes/editor/autosave";
import { SAVE_DELAY } from "@/pages/notes/editor/constants";
import type { EditorDocument } from "@/pages/notes/editor/document";

/** Снимок DOM принадлежит редактору; запросы и обновление Store выполняют actions. */
export function createEditorPersistence(options: {
  mainRegion: HTMLElement;
  document: EditorDocument;
  getNoteId: () => string | undefined;
  setNoteId: (id: string) => void;
  getNoteTagIds: () => string[];
  isActive: () => boolean;
  onUnauthorized: () => Promise<void>;
}) {
  const { readTitle, collectBlocks, applyBlockIds } = options.document;
  /**
   * Создаёт или обновляет открытую заметку по текущему DOM.
   *
   * @returns `false`, если запрос не удался и редактор ещё на экране.
   */
  async function save(): Promise<boolean> {
    if (!options.isActive()) return true;
    const title = readTitle();
    const { elements, blocks, skipped } = collectBlocks();
    const tagIds = options.mainRegion.querySelector("[data-note-tags]")
      ? options.getNoteTagIds()
      : undefined;
    try {
      let id = options.getNoteId();
      if (!id || (id === "new" && !title && !blocks.length && !tagIds?.length)) {
        noteActions.setSaveStatus("idle");
        return true;
      }
      noteActions.setSaveStatus("saving");
      if (id === "new") {
        const created = await noteActions.createNote({ title });
        id = created.id;
        options.setNoteId(id);
      }
      const saved = await noteActions.updateNote(id, { title, blocks, tag_ids: tagIds });
      // Обновляем только id отправленных узлов, не заменяя введённый за время запроса текст.
      applyBlockIds(elements, saved.blocks ?? []);
      for (const element of skipped) element.removeAttribute("data-block-id");
      if (options.isActive()) noteActions.setSaveStatus("saved");
      return true;
    } catch (error) {
      if (options.isActive()) {
        noteActions.setSaveStatus("error");
        if (error instanceof ApiError && error.status === 401) void options.onUnauthorized();
      }
      return false;
    }
  }
  const autosave = createAutosave({
    delay: SAVE_DELAY,
    save,
    onPending: () => {
      if (options.isActive()) noteActions.setSaveStatus("idle");
    },
    onFailure: () => {
      if (options.isActive()) noteActions.setSaveStatus("error");
    },
    canSchedule: options.isActive,
  });
  return { autosave };
}
