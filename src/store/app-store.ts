export type AuthStatus = "unknown" | "loading" | "authenticated" | "unauthenticated";

export interface AppState {
  auth: {
    status: AuthStatus;
    isLoggedIn: boolean;
    user: unknown;
  };
  ui: {
    isLoading: boolean;
  };
  notes: {
    searchQuery: string;
  };
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

const INITIAL_STATE: AppState = {
  auth: {
    status: "unknown",
    isLoggedIn: false,
    user: null,
  },
  ui: {
    isLoading: false,
  },
  notes: {
    searchQuery: "",
  },
};

/**
 * Создает независимую копию начального состояния.
 *
 * @returns Новое состояние, не связанное с предыдущим объектом.
 */
function createInitialState(): AppState {
  return {
    auth: { ...INITIAL_STATE.auth },
    ui: { ...INITIAL_STATE.ui },
    notes: { ...INITIAL_STATE.notes },
  };
}

/**
 * Проверяет, что значение является простым объектом.
 *
 * @param value Проверяемое значение.
 * @returns `true`, если это объект и не массив.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }
  return !Array.isArray(value);
}

/**
 * Рекурсивно объединяет текущее состояние с патчем.
 *
 * @param current Текущее значение ветки state.
 * @param patch Патч для этой ветки.
 * @returns Объединённое значение.
 */
function mergeState(current: unknown, patch: unknown): unknown {
  if (!isPlainObject(current) || !isPlainObject(patch)) {
    return patch;
  }

  const result: Record<string, unknown> = { ...current };
  for (const key of Object.keys(patch)) {
    result[key] = mergeState(current[key], patch[key]);
  }
  return result;
}

let state = createInitialState();
const listeners = new Set<(nextState: AppState) => void>();

function notify(): void {
  for (const listener of listeners) {
    listener(state);
  }
}

/**
 * Возвращает текущее состояние store.
 *
 * @returns Текущее состояние приложения.
 */
export function getState(): AppState {
  return state;
}

/**
 * Применяет частичное обновление состояния и уведомляет подписчиков.
 *
 * @param patch Частичный объект состояния.
 * @returns Состояние после объединения.
 */
export function setState(patch: DeepPartial<AppState>): AppState {
  state = mergeState(state, patch) as AppState;
  notify();
  return state;
}

/**
 * Подписывает обработчик на обновления состояния.
 *
 * @param listener Функция-слушатель.
 * @returns Функция отписки.
 */
export function subscribe(listener: (nextState: AppState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Полностью сбрасывает состояние к начальному.
 *
 * @returns Начальное состояние после сброса.
 */
export function resetState(): AppState {
  state = createInitialState();
  notify();
  return state;
}
