import { dispatcher } from "../app-dispatcher";
import type { Theme } from "./ui-action-types";

let toastTimer: number | undefined;

/**
 * Сохраняет тему и сообщает store. Если `localStorage` недоступен, тема живёт до перезагрузки.
 *
 * @param theme Светлая или тёмная схема.
 */
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // Тема доступна до перезагрузки, если localStorage недоступен.
  }
  dispatcher.dispatch({ type: "ui/theme-changed", theme });
}

/**
 * Записывает, есть ли сейчас соединение.
 *
 * @param online `true`, когда браузер снова в сети.
 */
export function setOnline(online: boolean): void {
  dispatcher.dispatch({ type: "ui/connection-changed", online });
}

/** Скрывает тост и отменяет таймер его автоскрытия. */
export function hideToast(): void {
  window.clearTimeout(toastTimer);
  toastTimer = undefined;
  dispatcher.dispatch({ type: "ui/toast-hidden" });
}

/**
 * Показывает тост. Новый тост заменяет предыдущий.
 *
 * @param message Текст.
 * @param isError Оформление ошибки.
 * @param duration Через сколько миллисекунд скрыть. `0` оставляет тост до ручного закрытия.
 */
export function showToast(message: string, isError = false, duration = 4000): void {
  window.clearTimeout(toastTimer);
  dispatcher.dispatch({ type: "ui/toast-shown", message, isError });
  if (duration > 0) {
    toastTimer = window.setTimeout(hideToast, duration);
  }
}

/**
 * Восстанавливает тему из `localStorage` и начинает следить за сетью.
 * Вызывается один раз при запуске приложения.
 */
export function initUi(): void {
  let theme: Theme = "light";
  try {
    if (localStorage.getItem("theme") === "dark") theme = "dark";
  } catch {
    // Используем светлую тему, если localStorage недоступен.
  }
  setTheme(theme);
  setOnline(navigator.onLine);
  window.addEventListener("online", () => setOnline(true));
  window.addEventListener("offline", () => setOnline(false));
}
