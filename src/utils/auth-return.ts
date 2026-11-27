const RETURN_NOTE_KEY = "bnn:return-note";
const NOTE_PATH = /^\/notes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let memoryPath: string | null = null;

export function rememberNotePath(path: string): void {
  memoryPath = NOTE_PATH.test(path) ? path : null;
  try {
    if (memoryPath) sessionStorage.setItem(RETURN_NOTE_KEY, memoryPath);
    else sessionStorage.removeItem(RETURN_NOTE_KEY);
  } catch {
    return;
  }
}

export function takeNotePath(): string {
  let path = memoryPath;
  try {
    path ??= sessionStorage.getItem(RETURN_NOTE_KEY);
  } catch {
    path = memoryPath;
  }
  rememberNotePath("");
  return path && NOTE_PATH.test(path) ? path : "/notes";
}
