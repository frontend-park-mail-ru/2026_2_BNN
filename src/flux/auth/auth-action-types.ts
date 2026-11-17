import type { User } from "../../types/user";

/** Запрос авторизации, который показывает индикатор загрузки на своей форме. */
export type AuthOperation = "login" | "signup" | "two-factor";

/** Действия сессии: проверка входа, успех, сброс и начало или конец операции. */
export type AuthAction =
  | { type: "auth/operation-started"; operation: AuthOperation }
  | { type: "auth/operation-finished"; operation: AuthOperation }
  | { type: "auth/data-cleared" }
  | { type: "auth/check-started" }
  | { type: "auth/authenticated"; user: User }
  | { type: "auth/unauthenticated" }
  | { type: "auth/reset" };
