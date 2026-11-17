import { api, isOfflineError } from "../../api";
import type { User } from "../../types/user";
import { dispatcher } from "../app-dispatcher";
import { authStore } from "./auth-store";
import type { AuthOperation } from "./auth-action-types";

const API_CACHE = "bnn-api";
const PROFILE_CACHE_PATH = "/api/auth/me";

let sessionVersion = 0;
let pendingAuthCheck: Promise<boolean> | null = null;
const operations = new Map<AuthOperation, symbol>();

/**
 * Проверяет, что JSON из кэша похож на профиль `/api/auth/me`.
 *
 * @param value Разобранное тело ответа.
 * @returns `true`, если обязательные поля профиля на месте.
 */
function isCachedUser(value: unknown): value is User {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const data = value as Record<string, unknown>;
  const avatarOk = typeof data.avatar === "string" || data.avatar === null;
  const providerOk = data.oauth_provider === null || data.oauth_provider === "github";

  return (
    typeof data.id === "string" &&
    typeof data.login === "string" &&
    avatarOk &&
    typeof data.created_at === "string" &&
    typeof data.updated_at === "string" &&
    typeof data.is_2fa_enabled === "boolean" &&
    providerOk
  );
}

/**
 * Достаёт профиль из кэша `bnn-api`, если его уже получали онлайн.
 *
 * @returns Профиль или `null`, если кэша нет или он битый.
 */
async function cachedProfile(): Promise<User | null> {
  if (!("caches" in window)) {
    return null;
  }

  try {
    const cache = await caches.open(API_CACHE);
    const response = await cache.match(PROFILE_CACHE_PATH, { ignoreVary: true });

    if (!response?.ok) {
      return null;
    }

    const data: unknown = await response.json();
    return isCachedUser(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Сбрасывает сессию, кэш API и данные stores.
 * Вызывается при выходе и после смены пользователя.
 *
 * @param status `unknown`, пока сессию не проверили, или `unauthenticated` после выхода.
 */
export function resetAuth(status: "unknown" | "unauthenticated" = "unknown"): void {
  sessionVersion += 1;
  pendingAuthCheck = null;
  operations.clear();

  void window.caches?.delete(API_CACHE);
  dispatcher.dispatch({ type: "auth/data-cleared" });
  dispatcher.dispatch({
    type: status === "unknown" ? "auth/reset" : "auth/unauthenticated",
  });
}

/**
 * Проверяет авторизацию по store и при необходимости запрашивает профиль.
 * Без сети берёт профиль из store или кэша service worker.
 *
 * @returns `true`, если пользователь авторизован.
 */
async function checkAuth(): Promise<boolean> {
  const auth = authStore.getState();

  if (auth.status === "authenticated") {
    return true;
  }

  if (auth.status === "unauthenticated") {
    return false;
  }

  const version = ++sessionVersion;
  const knownUser = auth.user;

  dispatcher.dispatch({ type: "auth/check-started" });

  try {
    const user = await api.getProfile();

    if (version !== sessionVersion) {
      return authStore.getState().status === "authenticated";
    }

    dispatcher.dispatch({ type: "auth/authenticated", user });
    return true;
  } catch (error) {
    const user = isOfflineError(error) ? (knownUser ?? (await cachedProfile())) : null;

    if (version !== sessionVersion) {
      return authStore.getState().status === "authenticated";
    }

    if (user) {
      dispatcher.dispatch({ type: "auth/authenticated", user });
      return true;
    }

    dispatcher.dispatch({
      type: isOfflineError(error) ? "auth/reset" : "auth/unauthenticated",
    });

    return false;
  }
}

/**
 * Возвращает текущую проверку сессии или запускает новую.
 * Параллельные вызовы роутера ждут один и тот же запрос.
 *
 * @returns `true`, если пользователь авторизован.
 */
export function ensureAuth(): Promise<boolean> {
  if (pendingAuthCheck) {
    return pendingAuthCheck;
  }

  const request = checkAuth();
  pendingAuthCheck = request;

  void request.then(
    () => {
      if (pendingAuthCheck === request) {
        pendingAuthCheck = null;
      }
    },
    () => {
      if (pendingAuthCheck === request) {
        pendingAuthCheck = null;
      }
    }
  );

  return request;
}

/**
 * Помечает операцию как выполняющуюся и снимает флаг, когда запрос закончился.
 * Повторный вызов той же операции отклоняется, пока первый не завершится.
 *
 * @param operation Какая форма показывает загрузку.
 * @param work Запрос к API.
 * @returns Результат `work`.
 */
async function runOperation<T>(operation: AuthOperation, work: () => Promise<T>): Promise<T> {
  if (authStore.getState().pending[operation]) {
    throw new Error("Запрос уже выполняется");
  }
  const token = Symbol(operation);
  operations.set(operation, token);
  dispatcher.dispatch({ type: "auth/operation-started", operation });
  try {
    return await work();
  } finally {
    if (operations.get(operation) === token) {
      operations.delete(operation);
      dispatcher.dispatch({ type: "auth/operation-finished", operation });
    }
  }
}

/**
 * Входит по логину и паролю.
 * Если сервер сразу открыл сессию, а не запросил код 2FA, локальное состояние сбрасывается.
 *
 * @param login Логин.
 * @param password Пароль.
 * @returns Сессия или требование второго фактора.
 */
export function logIn(login: string, password: string) {
  return runOperation("login", async () => {
    const version = sessionVersion;
    const result = await api.logIn(login, password);
    if (version !== sessionVersion) {
      throw new Error("Сессия изменилась во время входа");
    }
    if (result.kind === "session") {
      resetAuth();
    }
    return result;
  });
}

/**
 * Регистрирует пользователя и сбрасывает локальную сессию.
 *
 * @param login Логин.
 * @param password Пароль.
 */
export function signUp(login: string, password: string): Promise<void> {
  return runOperation("signup", async () => {
    const version = sessionVersion;
    await api.signUp(login, password);
    if (version !== sessionVersion) {
      throw new Error("Сессия изменилась во время регистрации");
    }
    resetAuth();
  });
}

/**
 * Подтверждает вход кодом двухфакторной аутентификации.
 *
 * @param code Код из приложения-аутентификатора.
 * @returns Профиль вошедшего пользователя.
 */
export function verifyTwoFactor(code: string): Promise<User> {
  return runOperation("two-factor", async () => {
    const version = sessionVersion;
    const user = await api.verifyTwoFactor(code);
    if (version !== sessionVersion) {
      throw new Error("Сессия изменилась во время подтверждения");
    }
    resetAuth();
    return user;
  });
}

/**
 * Завершает сессию на сервере и помечает пользователя как неавторизованного.
 * Локальный сброс выполняется и тогда, когда запрос выхода не дошёл.
 */
export async function logOut(): Promise<void> {
  const version = sessionVersion;
  try {
    await api.logOut();
  } finally {
    if (version === sessionVersion) resetAuth("unauthenticated");
  }
}
