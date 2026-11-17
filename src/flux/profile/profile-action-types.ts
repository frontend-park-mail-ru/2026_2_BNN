import type { User } from "../../types/user";

/** Экран внутри диалога профиля. */
export type ProfileView =
  "loading" | "menu" | "password" | "twoFactor" | "twoFactorDisable" | "avatar";
/** Запрос профиля: чтение, аватар, пароль, QR или переключение 2FA. */
export type ProfileOperation =
  "load" | "avatar" | "password" | "qr" | "enable-two-factor" | "disable-two-factor";
/** Ошибка операции профиля для формы или тоста. */
export interface ProfileError {
  message: string;
  status: number | null;
}
/** Ход одной операции. `context` отсекает ответ, пришедший после смены экрана. */
export interface OperationState {
  status: "idle" | "pending" | "success" | "error";
  requestId: number;
  context: number;
  error: ProfileError | null;
}
/** Действия диалога профиля: открытие, экран, операция, QR и обновление пользователя. */
export type ProfileAction =
  | { type: "profile/opened" }
  | { type: "profile/closed" }
  | { type: "profile/view-changed"; view: ProfileView }
  | {
      type: "profile/operation-started";
      operation: ProfileOperation;
      requestId: number;
      context: number;
    }
  | {
      type: "profile/operation-finished";
      operation: ProfileOperation;
      requestId: number;
      error: ProfileError | null;
    }
  | { type: "profile/qr-changed"; url: string }
  | { type: "profile/user-updated"; user: User; fields: "all" | "avatar" | "two-factor" };
