import { Dispatcher } from "@/flux/dispatcher";
import type { AuthAction } from "@/flux/auth/auth-action-types";
import type { UiAction } from "@/flux/ui/ui-action-types";
import type { TagAction } from "@/flux/tags/tag-action-types";
import type { NoteAction } from "@/flux/notes/note-action-types";
import type { ProfileAction } from "@/flux/profile/profile-action-types";

/** Любое действие приложения: авторизация, интерфейс, теги, заметки или профиль. */
export type AppAction = AuthAction | UiAction | TagAction | NoteAction | ProfileAction;

/** Единственный диспетчер приложения. Stores подписываются на него при создании. */
export const dispatcher = new Dispatcher<AppAction>();
