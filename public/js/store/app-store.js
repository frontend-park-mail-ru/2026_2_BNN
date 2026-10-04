const INITIAL_STATE = {
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
 * @returns {{auth: {status: string, isLoggedIn: boolean, user: unknown}, ui: {isLoading: boolean}, notes: {searchQuery: string}}}
 */
function createInitialState() {
  return {
    auth: { ...INITIAL_STATE.auth },
    ui: { ...INITIAL_STATE.ui },
    notes: { ...INITIAL_STATE.notes },
  };
}

/**
 * Проверяет, что значение является простым объектом.
 *
 * @param {unknown} value Проверяемое значение.
 * @returns {boolean}
 */
function isPlainObject(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  return !Array.isArray(value);
}

/**
 * Рекурсивно объединяет текущее состояние с патчем.
 *
 * @param {unknown} current Текущее значение ветки state.
 * @param {unknown} patch Патч для этой ветки.
 * @returns {unknown}
 */
function mergeState(current, patch) {
  if (!isPlainObject(current) || !isPlainObject(patch)) {
    return patch;
  }

  const result = { ...current };
  for (const key of Object.keys(patch)) {
    result[key] = mergeState(current[key], patch[key]);
  }
  return result;
}

let state = createInitialState();
const listeners = new Set();

function notify() {
  for (const listener of listeners) {
    listener(state);
  }
}

/**
 * Возвращает текущее состояние store.
 *
 * @returns {{auth: {status: string, isLoggedIn: boolean, user: unknown}, ui: {isLoading: boolean}, notes: {searchQuery: string}}}
 */
export function getState() {
  return state;
}

/**
 * Применяет частичное обновление состояния и уведомляет подписчиков.
 *
 * @param {Record<string, unknown>} patch Частичный объект состояния.
 * @returns {{auth: {status: string, isLoggedIn: boolean, user: unknown}, ui: {isLoading: boolean}, notes: {searchQuery: string}}}
 */
export function setState(patch) {
  state = mergeState(state, patch);
  notify();
  return state;
}

/**
 * Подписывает обработчик на обновления состояния.
 *
 * @param {(nextState: unknown) => void} listener Функция-слушатель.
 * @returns {() => void} Функция отписки.
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Полностью сбрасывает состояние к начальному.
 *
 * @returns {{auth: {status: string, isLoggedIn: boolean, user: unknown}, ui: {isLoading: boolean}, notes: {searchQuery: string}}}
 */
export function resetState() {
  state = createInitialState();
  notify();
  return state;
}
