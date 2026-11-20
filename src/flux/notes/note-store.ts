import { dispatcher } from "@/flux/app-dispatcher";
import { BaseStore } from "@/flux/base-store";
import type {
  NoteStateItem,
  NotesStatus,
  SaveStatus,
  LoadError,
  NoteLoadState,
  DetailsStatus,
} from "@/flux/notes/note-action-types";

/** Список заметок и статусы загрузки, сохранения и догрузки тел. */
interface NotesState {
  favoriteIds: string[];
  favoritesStatus: "idle" | "loading" | "ready" | "error";
  pendingFavoriteIds: string[];
  notes: NoteStateItem[];
  status: NotesStatus;
  saveStatus: SaveStatus;
  loadError: LoadError | null;
  noteLoads: Record<string, NoteLoadState>;
  detailsStatus: DetailsStatus;
}

const initialState = (): NotesState => ({
  favoriteIds: [],
  favoritesStatus: "idle",
  pendingFavoriteIds: [],
  notes: [],
  status: "idle",
  saveStatus: "idle",
  loadError: null,
  noteLoads: {},
  detailsStatus: "idle",
});

/** Хранит заметки. На изменение тега или выход обновляет связанные поля сам. */
class NotesStore extends BaseStore<NotesState> {
  /** Подписывает store на действия заметок, тегов и сброса сессии. */
  constructor() {
    super(initialState());
    dispatcher.register((action) => {
      switch (action.type) {
        case "notes/favorites-loading":
          this.state = { ...this.state, favoritesStatus: "loading" };
          break;
        case "notes/favorites-loaded":
          this.state = { ...this.state, favoritesStatus: "ready", favoriteIds: action.ids };
          break;
        case "notes/favorites-failed":
          this.state = { ...this.state, favoritesStatus: "error" };
          break;
        case "notes/favorite-pending":
          this.state = {
            ...this.state,
            pendingFavoriteIds: [...this.state.pendingFavoriteIds, action.id],
          };
          break;
        case "notes/favorite-finished": {
          if (!this.state.pendingFavoriteIds.includes(action.id)) return;
          let ids = this.state.favoriteIds;
          if (action.favorite === true && !ids.includes(action.id)) ids = [...ids, action.id];
          if (action.favorite === false) ids = ids.filter((id) => id !== action.id);
          this.state = {
            ...this.state,
            favoriteIds: ids,
            pendingFavoriteIds: this.state.pendingFavoriteIds.filter((id) => id !== action.id),
          };
          break;
        }
        case "notes/loading":
          this.state = { ...this.state, status: "loading", loadError: null };
          break;
        case "notes/loaded":
          this.state = { ...this.state, notes: action.notes, status: "ready", loadError: null };
          break;
        case "notes/save-status-changed":
          this.state = { ...this.state, saveStatus: action.status };
          break;
        case "notes/load-failed":
          this.state = {
            ...this.state,
            loadError: action.error,
            status:
              action.error === "unauthorized"
                ? "unauthorized"
                : this.state.notes.length
                  ? "ready"
                  : "error",
          };
          break;
        case "notes/note-loading":
          this.state = {
            ...this.state,
            noteLoads: { ...this.state.noteLoads, [action.id]: { status: "loading", error: null } },
          };
          break;
        case "notes/note-loaded": {
          const loaded = action.note;
          const exists = this.state.notes.some((note) => note.id === action.id);
          this.state = {
            ...this.state,
            notes: loaded
              ? exists
                ? this.state.notes.map((note) => (note.id === action.id ? loaded : note))
                : [loaded, ...this.state.notes]
              : this.state.notes,
            noteLoads: { ...this.state.noteLoads, [action.id]: { status: "ready", error: null } },
          };
          break;
        }
        case "notes/note-load-failed":
          this.state = {
            ...this.state,
            notes:
              action.error === "missing"
                ? this.state.notes.filter((note) => note.id !== action.id)
                : this.state.notes,
            noteLoads: {
              ...this.state.noteLoads,
              [action.id]: { status: "error", error: action.error },
            },
          };
          break;
        case "notes/details-status-changed":
          this.state = { ...this.state, detailsStatus: action.status };
          break;
        case "notes/updated": {
          const index = this.state.notes.findIndex((note) => note.id === action.note.id);
          const notes = [...this.state.notes];
          if (index < 0) notes.unshift(action.note);
          else notes[index] = action.note;
          this.state = {
            ...this.state,
            notes,
            noteLoads: {
              ...this.state.noteLoads,
              [action.note.id]: { status: "ready", error: null },
            },
          };
          break;
        }
        case "notes/deleted":
          this.state = {
            ...this.state,
            favoriteIds: this.state.favoriteIds.filter((id) => id !== action.id),
            pendingFavoriteIds: this.state.pendingFavoriteIds.filter((id) => id !== action.id),
            notes: this.state.notes.filter((note) => note.id !== action.id),
          };
          break;
        case "tags/saved":
          this.state = {
            ...this.state,
            notes: this.state.notes.map((note) => ({
              ...note,
              tags: note.tags.map((tag) => (tag.id === action.tag.id ? action.tag : tag)),
            })),
          };
          break;
        case "tags/deleted":
          this.state = {
            ...this.state,
            notes: this.state.notes.map((note) => ({
              ...note,
              tags: note.tags.filter((tag) => tag.id !== action.id),
            })),
          };
          break;
        case "auth/data-cleared":
          this.state = initialState();
          break;
        default:
          return;
      }
      this.emit();
    });
  }
}

/** Единственный store заметок. */
export const notesStore = new NotesStore();
