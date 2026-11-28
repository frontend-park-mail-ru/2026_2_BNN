const RETURN_KEY = "bnn:onlineconf:return_to";
const KEY_PATH =
  /^\/onlineconf\/keys\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/history)?\/?$/i;

export function onlineconfReturnPath(value: string): string | null {
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\s]/.test(value)) return null;

  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname !== value) return null;
    if (value === "/onlineconf" || value === "/onlineconf/") return "/onlineconf/";
    return value === "/onlineconf/keys/new" || KEY_PATH.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveOnlineconfReturn(path: string): boolean {
  const target = onlineconfReturnPath(path) ?? "/onlineconf/";
  try {
    sessionStorage.setItem(RETURN_KEY, target);
    return true;
  } catch {
    return false;
  }
}

export function returnToOnlineconf(): boolean {
  try {
    const saved = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    const target = saved ? onlineconfReturnPath(saved) : null;
    if (!target) return false;
    window.location.replace(target);
    return true;
  } catch {
    return false;
  }
}
