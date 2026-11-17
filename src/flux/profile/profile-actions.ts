import { api, ApiError } from "../../api";
import type { User } from "../../types/user";
import { dispatcher } from "../app-dispatcher";
import { resetAuth } from "../auth/auth-actions";
import { authStore } from "../auth/auth-store";
import { showToast } from "../ui/ui-actions";
import type { ProfileError, ProfileOperation, ProfileView } from "./profile-action-types";
import { profileStore } from "./profile-store";

let sessionVersion = 0;
let mutationVersion = 0;
let requestId = 0;
let qrUrl = "";
let qrGeneration = 0;
const pending = new Map<ProfileOperation, Promise<void>>();
dispatcher.register((action) => {
  if (action.type === "auth/data-cleared") {
    sessionVersion++;
    mutationVersion++;
    pending.clear();
    qrGeneration++;
    if (qrUrl) URL.revokeObjectURL(qrUrl);
    qrUrl = "";
  }
});

const errors: Record<ProfileOperation, string> = {
  load: "Не удалось открыть профиль, попробуйте позже",
  avatar: "Не удалось обновить аватар, попробуйте позже",
  password: "Не удалось сохранить пароль, попробуйте позже",
  qr: "Не удалось получить QR-код",
  "enable-two-factor": "Не удалось включить двухфакторную аутентификацию, попробуйте позже",
  "disable-two-factor": "Не удалось отключить двухфакторную аутентификацию, попробуйте позже",
};
const successes: Partial<Record<ProfileOperation, string>> = {
  avatar: "Аватар обновлён",
  password: "Пароль изменён",
  "enable-two-factor": "Двухфакторная аутентификация включена",
  "disable-two-factor": "Двухфакторная аутентификация отключена",
};

/** Освобождает объектный URL QR-кода и убирает его из store. */
export function clearQr(): void {
  if (qrUrl) URL.revokeObjectURL(qrUrl);
  qrUrl = "";
  dispatcher.dispatch({ type: "profile/qr-changed", url: "" });
}
/**
 * Переключает экран диалога. Уход с экрана QR освобождает его адрес.
 *
 * @param view Следующий экран.
 */
export function showView(view: ProfileView): void {
  if (view !== "twoFactor") clearQr();
  dispatcher.dispatch({ type: "profile/view-changed", view });
}
/** Закрывает диалог профиля и освобождает QR-код. */
export function closeProfile(): void {
  clearQr();
  dispatcher.dispatch({ type: "profile/closed" });
}
/**
 * Открывает диалог и запрашивает актуальный профиль.
 *
 * @returns Запрос профиля. Ошибка показывается тостом и закрывает диалог.
 */
export function openProfile(): Promise<void> {
  clearQr();
  dispatcher.dispatch({ type: "profile/opened" });
  return loadProfile();
}

/** Что операция может вернуть в store: профиль, QR или ничего. */
interface OperationResult {
  user?: User;
  qr?: string;
}
/**
 * Выполняет операцию профиля и записывает успех или ошибку в store.
 * Повторное чтение заменяет предыдущее. Повторная мутация ждёт уже идущую.
 *
 * @param operation Какая операция показывает состояние на форме.
 * @param work Запрос к API.
 */
function run(operation: ProfileOperation, work: () => Promise<OperationResult>): Promise<void> {
  // Повторное чтение после закрытия модалки заменяет старое, мутации объединяются.
  const previous = pending.get(operation);
  if (previous && operation !== "load" && operation !== "qr") return previous;
  if (authStore.getState().status !== "authenticated") return Promise.resolve();
  const version = sessionVersion;
  const revision = mutationVersion;
  const context = profileStore.getState().context;
  const id = ++requestId;
  const userId = authStore.getState().user?.id;
  const sameSession = () => version === sessionVersion && authStore.getState().user?.id === userId;
  const currentView = () =>
    profileStore.getState().open && profileStore.getState().context === context;
  dispatcher.dispatch({ type: "profile/operation-started", operation, requestId: id, context });
  const request = Promise.resolve()
    .then(async () => {
      if (!sameSession()) return;
      try {
        const result = await work();
        if (!sameSession() || profileStore.getState().operations[operation].requestId !== id) {
          if (result.qr) URL.revokeObjectURL(result.qr);
          return;
        }
        if (result.user && (operation !== "load" || revision === mutationVersion)) {
          if (operation !== "load") mutationVersion++;
          dispatcher.dispatch({
            type: "profile/user-updated",
            user: result.user,
            fields: operation === "load" ? "all" : operation === "avatar" ? "avatar" : "two-factor",
          });
        }
        if (result.qr) {
          if (currentView()) {
            clearQr();
            qrUrl = result.qr;
            dispatcher.dispatch({ type: "profile/qr-changed", url: qrUrl });
          } else URL.revokeObjectURL(result.qr);
        }
        dispatcher.dispatch({
          type: "profile/operation-finished",
          operation,
          requestId: id,
          error: null,
        });
        if (!currentView()) return;
        if (operation === "load" && profileStore.getState().view === "loading") showView("menu");
        const message = successes[operation];
        if (message) {
          showView("menu");
          showToast(message);
        }
      } catch (error) {
        if (!sameSession() || profileStore.getState().operations[operation].requestId !== id)
          return;
        if (error instanceof ApiError && error.status === 401) {
          resetAuth("unauthenticated");
          return;
        }
        const failure: ProfileError = {
          status: error instanceof ApiError ? error.status : null,
          message:
            error instanceof ApiError && [400, 403, 409, 413, 415].includes(error.status)
              ? error.message
              : errors[operation],
        };
        dispatcher.dispatch({
          type: "profile/operation-finished",
          operation,
          requestId: id,
          error: failure,
        });
        if (!currentView()) return;
        if (operation === "load") {
          showToast(failure.message, true);
          closeProfile();
        } else if (operation === "qr") {
          showView("menu");
          showToast(failure.message, true);
          if (failure.status === 409) void loadProfile();
        } else if (failure.status !== 403 || operation === "avatar")
          showToast(failure.message, true);
      }
    })
    .finally(() => {
      if (pending.get(operation) === request) pending.delete(operation);
    });
  pending.set(operation, request);
  return request;
}

/** Запрашивает профиль и обновляет пользователя в сессии. */
export function loadProfile(): Promise<void> {
  return run("load", async () => ({ user: await api.getProfile() }));
}
/**
 * Загружает новый аватар.
 *
 * @param file Обрезанное изображение JPEG, PNG или WebP.
 */
export function updateAvatar(file: File): Promise<void> {
  return run("avatar", async () => ({ user: await api.updateAvatar(file) }));
}
/**
 * Меняет пароль.
 *
 * @param oldPassword Текущий пароль.
 * @param newPassword Новый пароль.
 */
export function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  return run("password", async () => {
    await api.changePassword(oldPassword, newPassword);
    return {};
  });
}
/**
 * Открывает экран включения 2FA и запрашивает QR.
 * Новый запрос ждёт предыдущие операции QR и 2FA: сервер заменяет секрет при генерации.
 */
export async function generateTwoFactorQr(): Promise<void> {
  const state = profileStore.getState();
  if (
    state.view === "twoFactor" &&
    state.operations.qr.status === "pending" &&
    state.operations.qr.context === state.context
  )
    return pending.get("qr");
  clearQr();
  showView("twoFactor");
  const context = profileStore.getState().context;
  const generation = ++qrGeneration;
  // Сервер заменяет секрет при генерации: запросы QR должны завершаться по порядку.
  await Promise.all([
    pending.get("qr"),
    pending.get("enable-two-factor"),
    pending.get("disable-two-factor"),
  ]);
  if (
    generation !== qrGeneration ||
    !profileStore.getState().open ||
    profileStore.getState().context !== context
  )
    return;
  return run("qr", async () => ({ qr: await api.generateTwoFactorQr() }));
}
/**
 * Включает двухфакторную аутентификацию.
 *
 * @param code Код из приложения-аутентификатора.
 */
export function enableTwoFactor(code: string): Promise<void> {
  return run("enable-two-factor", async () => ({ user: await api.enableTwoFactor(code) }));
}
/**
 * Отключает двухфакторную аутентификацию.
 *
 * @param code Код из приложения-аутентификатора.
 */
export function disableTwoFactor(code: string): Promise<void> {
  return run("disable-two-factor", async () => ({ user: await api.disableTwoFactor(code) }));
}
