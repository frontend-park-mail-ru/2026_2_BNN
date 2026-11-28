import type {
  AdminSession,
  AdminUser,
  FlagEvaluation,
  CreateKeyInput,
  KeyFilters,
  KeyHistoryEntry,
  KeyListItem,
  OnlineconfKey,
  Scope,
  UpdateKeyInput,
} from "../types/onlineconf";

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

/** Запускает одно общее обновление сессии для параллельных запросов. */
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

/** Ожидает обновления сессии с учётом отмены отдельного запроса. */
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

/** Выполняет запрос к админке и повторяет его после успешного обновления сессии. */
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

/** Читает JSON и проверяет форму ответа перед возвратом данных. */
async function read<T>(
  path: string,
  signal: AbortSignal | undefined,
  valid: (data: T) => boolean,
  options: Options & { body?: object } = {}
): Promise<T> {
  const response = await request(path, { ...options, signal });
  const data: T | null = await response.json().catch(() => null);
  signal?.throwIfAborted();
  if (response.status !== 200 || data == null || !valid(data)) {
    throw new ApiError(response.status, "INVALID_RESPONSE", "Некорректный ответ сервера");
  }
  return data;
}

export async function getSession(signal?: AbortSignal): Promise<AdminSession> {
  const { login } = await read<AdminSession>("/session", signal, (session) =>
    Boolean(typeof session.login === "string" && session.login.trim())
  );
  return { login };
}

/** Ищет до десяти пользователей по логину для персональных правил флага. */
export function searchUsers(query: string, signal?: AbortSignal): Promise<AdminUser[]> {
  const login = query.trim();
  if (!login) return Promise.resolve([]);

  const params = new URLSearchParams({ query: login });

  return read<AdminUser[]>(
    `/users?${params}`,
    signal,
    (users) =>
      Array.isArray(users) &&
      users.length <= 10 &&
      users.every(
        (user) =>
          user !== null &&
          typeof user.id === "string" &&
          user.id.trim() !== "" &&
          typeof user.login === "string" &&
          user.login.trim() !== ""
      )
  );
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

/** Проверяет сохранённый флаг для выбранного пользователя на сервере. */
export function evaluateFlag(
  id: string,
  userId: string,
  signal?: AbortSignal
): Promise<FlagEvaluation> {
  return read<FlagEvaluation>(
    `${keyPath(id)}/evaluate`,
    signal,
    ({ result, reason, revision }) =>
      typeof result === "boolean" &&
      ["disabled", "excluded", "included", "rollout"].includes(reason) &&
      Number.isSafeInteger(revision) &&
      revision >= 0,
    { method: "POST", body: { user_id: userId } }
  );
}

/** Загружает историю напрямую, в том числе для удалённого ключа, если API её возвращает. */
export function getKeyHistory(id: string, signal?: AbortSignal): Promise<KeyHistoryEntry[]> {
  const isSnapshot = (value: unknown) =>
    value === null || (typeof value === "object" && !Array.isArray(value));

  return read<KeyHistoryEntry[]>(
    `${keyPath(id)}/history`,
    signal,
    (entries) =>
      Array.isArray(entries) &&
      entries.every(
        (entry) =>
          entry != null &&
          typeof entry.id === "string" &&
          typeof entry.action === "string" &&
          typeof entry.user?.login === "string" &&
          typeof entry.created_at === "string" &&
          isSnapshot(entry.old_value) &&
          isSnapshot(entry.new_value)
      )
  );
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

/** Собирает тело записи из полей ключа без серверных метаданных. */
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
