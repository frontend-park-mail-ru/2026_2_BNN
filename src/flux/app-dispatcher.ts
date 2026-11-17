import { Dispatcher } from "./dispatcher";
import type { AuthAction } from "./auth/auth-action-types";
import type { UiAction } from "./ui/ui-action-types";
import type { TagAction } from "./tags/tag-action-types";
import type { NoteAction } from "./notes/note-action-types";
import type { ProfileAction } from "./profile/profile-action-types";

/** Любое действие приложения: авторизация, интерфейс, теги, заметки или профиль. */
export type AppAction = AuthAction | UiAction | TagAction | NoteAction | ProfileAction;

/** Единственный диспетчер приложения. Stores подписываются на него при создании. */
export const dispatcher = new Dispatcher<AppAction>();
