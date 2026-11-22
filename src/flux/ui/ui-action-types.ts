/** Цветовая схема интерфейса. */
export type Theme = "light" | "dark";

/** Действия темы, сети и тоста. */
export type UiAction =
  | { type: "ui/theme-changed"; theme: Theme }
  | { type: "ui/connection-changed"; online: boolean }
  | { type: "ui/toast-shown"; message: string; isError: boolean }
  | { type: "ui/toast-hidden" };
