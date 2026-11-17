import type { User } from "../../types/user";
import { dispatcher } from "../app-dispatcher";
import { BaseStore } from "../base-store";
import type { AuthOperation } from "./auth-action-types";

/** Состояние сессии: ещё не проверяли, идёт проверка, вошли или нет. */
export type AuthStatus = "unknown" | "loading" | "authenticated" | "unauthenticated";

/** Профиль текущего пользователя и флаги выполняющихся запросов входа. */
export interface AuthState {
  status: AuthStatus;
  user: User | null;
  pending: Readonly<Record<AuthOperation, boolean>>;
}

/** Хранит сессию. Профиль обновляет и действие профиля, если id совпадает. */
class AuthStore extends BaseStore<AuthState> {
  /** Подписывает store на действия авторизации и обновления профиля. */
  constructor() {
    super({
      status: "unknown",
      user: null,
      pending: { login: false, signup: false, "two-factor": false },
    });

    dispatcher.register((action) => {
      switch (action.type) {
        case "auth/data-cleared":
          this.state = {
            status: "unknown",
            user: null,
            pending: { login: false, signup: false, "two-factor": false },
          };
          break;
        case "auth/check-started":
          this.state = { ...this.state, status: "loading", user: null };
          break;

        case "auth/authenticated":
          this.state = { ...this.state, status: "authenticated", user: action.user };
          break;

        case "profile/user-updated": {
          const current = this.state.user;
          if (!current || current.id !== action.user.id || this.state.status !== "authenticated")
            return;
          const user =
            action.fields === "all"
              ? action.user
              : action.fields === "avatar"
                ? { ...current, avatar: action.user.avatar }
                : { ...current, is_2fa_enabled: action.user.is_2fa_enabled };
          this.state = { ...this.state, user };
          break;
        }

        case "auth/unauthenticated":
          this.state = { ...this.state, status: "unauthenticated", user: null };
          break;

        case "auth/reset":
          this.state = { ...this.state, status: "unknown", user: null };
          break;

        case "auth/operation-started":
        case "auth/operation-finished":
          this.state = {
            ...this.state,
            pending: {
              ...this.state.pending,
              [action.operation]: action.type === "auth/operation-started",
            },
          };
          break;

        default:
          return;
      }

      this.emit();
    });
  }
}

/** Единственный store сессии. */
export const authStore = new AuthStore();
