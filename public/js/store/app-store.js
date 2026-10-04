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

function createInitialState() {
  return {
    auth: { ...INITIAL_STATE.auth },
    ui: { ...INITIAL_STATE.ui },
    notes: { ...INITIAL_STATE.notes },
  };
}

function isPlainObject(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  return !Array.isArray(value);
}

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

export function getState() {
  return state;
}

export function setState(patch) {
  state = mergeState(state, patch);
  notify();
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetState() {
  state = createInitialState();
  notify();
  return state;
}
