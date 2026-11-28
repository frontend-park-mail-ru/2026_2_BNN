import type {
  AdminUser,
  CreateKeyInput,
  KeyFilters,
  KeyListItem,
  OnlineconfKey,
  Scope,
  UpdateKeyInput,
} from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Options = { method?: "GET" | "POST" | "PUT" | "DELETE"; signal?: AbortSignal };
let refreshing: Promise<void> | undefined;
let sessionGeneration = 0;

function csrfToken(): string {
  const cookie = document.cookie.split(";").map((item) => item.trim());
  const value =
    cookie.find((item) => item.startsWith("bnn_csrf="))?.slice("bnn_csrf=".length) ?? "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function send(url: string, { method = "GET", signal }: Options, body?: string) {
  signal?.throwIfAborted();
  const token = method === "GET" ? "" : csrfToken();
  try {
    return await fetch(url, {
      method,
      signal,
      body,
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { "X-CSRF-Token": token } : {}),
      },
    });
  } catch {
    signal?.throwIfAborted();
    throw new ApiError(0, "NETWORK_ERROR", "Не удалось связаться с сервером");
  }
}

async function refreshSession(): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await send("/api/auth/refresh", { method: "POST", signal: controller.signal });
    if ([400, 401, 403].includes(response.status)) {
      throw new ApiError(401, "UNAUTHORIZED", "Нужно войти в аккаунт");
    }
    if (!response.ok) {
      throw new ApiError(response.status, "REFRESH_FAILED", "Не удалось обновить сессию");
    }
    sessionGeneration++;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(0, "TIMEOUT", "Не удалось обновить сессию вовремя");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    refreshing = undefined;
  }
}

async function waitForRefresh(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const refresh = (refreshing ??= refreshSession());
  if (!signal) return refresh;
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    await Promise.race([refresh, aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export async function request(path: string, options: Options & { body?: object } = {}) {
  const url = `/api/onlineconf/admin${path}`;
  const body = JSON.stringify(options.body);
  const generation = sessionGeneration;
  let response = await send(url, options, body);
  if (response.status === 401) {
    if (generation === sessionGeneration) await waitForRefresh(options.signal);
    response = await send(url, options, body);
  }
  options.signal?.throwIfAborted();
  if (response.ok) return response;

  const { status } = response;
  if (status === 404 || status === 403) {
    throw new ApiError(status, "NOT_FOUND", "Страница не найдена или недоступна");
  }
  if (status === 401) throw new ApiError(status, "UNAUTHORIZED", "Нужно войти в аккаунт");

  const data: { code?: unknown; message?: unknown } | null = await response
    .json()
    .catch(() => null);
  options.signal?.throwIfAborted();
  const code = typeof data?.code === "string" ? data.code : "HTTP_ERROR";
  const message = typeof data?.message === "string" ? data.message.trim() : "";
  throw new ApiError(status, code, message || "Не удалось выполнить запрос");
}

async function read<T>(
  path: string,
  signal: AbortSignal | undefined,
  valid: (data: T) => boolean
): Promise<T> {
  const response = await request(path, { signal });
  const data: T | null = await response.json().catch(() => null);
  signal?.throwIfAborted();
  if (response.status !== 200 || data == null || !valid(data)) {
    throw new ApiError(response.status, "INVALID_RESPONSE", "Некорректный ответ сервера");
  }
  return data;
}

export async function getSession(signal?: AbortSignal): Promise<AdminUser> {
  const { id, login } = await read<AdminUser>("/session", signal, (user) =>
    Boolean(typeof user.id === "string" && user.id && typeof user.login === "string" && user.login)
  );
  return { id, login };
}

export function getScopes(signal?: AbortSignal) {
  return read<Scope[]>(
    "/scopes",
    signal,
    (scopes) =>
      Array.isArray(scopes) &&
      scopes.every((scope) => ["frontend", "backend", "auth", "notes"].includes(scope))
  );
}

export function listKeys(filters: KeyFilters = {}, signal?: AbortSignal) {
  const query = new URLSearchParams();
  if (filters.query !== undefined) query.set("query", filters.query);
  if (filters.scope !== undefined) query.set("scope", filters.scope);
  if (filters.kind !== undefined) query.set("kind", filters.kind);
  return read<KeyListItem[]>(query.size ? `/keys?${query}` : "/keys", signal, Array.isArray);
}

function keyPath(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new ApiError(0, "VALIDATION", "Некорректный идентификатор ключа");
  }
  return `/keys/${id}`;
}

function validVersion(version: number): boolean {
  return Number.isSafeInteger(version) && version > 0;
}

export async function getKey(id: string, signal?: AbortSignal) {
  return read<OnlineconfKey>(keyPath(id), signal, (key) => {
    if (!validVersion(key.version)) return false;
    if (key.kind === "config") return Boolean(key.config);
    return (
      key.kind === "flag" &&
      Array.isArray(key.flag?.include_users) &&
      Array.isArray(key.flag?.exclude_users)
    );
  });
}

function keyBody(input: CreateKeyInput): object {
  const { scope, key, description, is_public } = input;
  const base = { scope, key, description, is_public };
  if (input.kind === "config") {
    const { value_type, value } = input.config;
    return { ...base, kind: "config", config: { value_type, value } };
  }
  const { enabled, rollout_percent, include_user_ids, exclude_user_ids } = input.flag;
  return {
    ...base,
    kind: "flag",
    flag: { enabled, rollout_percent, include_user_ids, exclude_user_ids },
  };
}

function checkVersion(version: number): void {
  if (!validVersion(version)) throw new ApiError(0, "VALIDATION", "Нужна текущая версия ключа");
}

export function createKey(input: CreateKeyInput, signal?: AbortSignal) {
  return request("/keys", { method: "POST", body: keyBody(input), signal });
}

export function updateKey(id: string, input: UpdateKeyInput, signal?: AbortSignal) {
  checkVersion(input.version);
  const body = { ...keyBody(input), version: input.version };
  return request(keyPath(id), { method: "PUT", body, signal });
}

export async function deleteKey(id: string, version: number, signal?: AbortSignal): Promise<void> {
  checkVersion(version);
  await request(`${keyPath(id)}?version=${version}`, { method: "DELETE", signal });
}
