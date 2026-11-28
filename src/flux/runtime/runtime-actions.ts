import { api } from "@/api";
import { authStore } from "@/flux/auth/auth-store";
import { runtimeConfigStore, type RuntimeSnapshot } from "@/flux/runtime/runtime-store";

const POLL_INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 10_000;

let currentUserId: string | null = null;
let pollTimer: number | undefined;
let pending: AbortController | null = null;
let initialized = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRuntimeSnapshot(value: unknown): value is RuntimeSnapshot {
  if (!isRecord(value)) return false;

  return (
    typeof value.user_id === "string" &&
    typeof value.revision === "number" &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0 &&
    isRecord(value.configs) &&
    Object.values(value.configs).every(isRecord) &&
    isRecord(value.flags) &&
    Object.values(value.flags).every(
      (scope) => isRecord(scope) && Object.values(scope).every((flag) => typeof flag === "boolean")
    )
  );
}

export async function refreshRuntime(): Promise<void> {
  const userId = currentUserId;
  if (!userId || pending) return;

  const request = new AbortController();
  pending = request;
  const timeout = window.setTimeout(() => request.abort(), REQUEST_TIMEOUT_MS);

  try {
    const snapshot = await api.request<unknown>("/api/onlineconf/runtime", {
      cache: "no-store",
      signal: request.signal,
    });

    if (pending !== request || request.signal.aborted) return;
    if (!isRuntimeSnapshot(snapshot) || snapshot.user_id !== userId) return;

    const previous = runtimeConfigStore.getState().snapshot;
    if (previous && snapshot.revision <= previous.revision) return;

    runtimeConfigStore.replace(snapshot);
  } catch {
    // Сетевой сбой или отмена: сохраняем последний принятый снимок.
  } finally {
    window.clearTimeout(timeout);
    if (pending === request) pending = null;
  }
}

function syncRuntimeSession(): void {
  const { status, user } = authStore.getState();
  const nextUserId = status === "authenticated" ? (user?.id ?? null) : null;
  if (nextUserId === currentUserId) return;

  window.clearInterval(pollTimer);
  pending?.abort();
  pending = null;
  currentUserId = nextUserId;
  runtimeConfigStore.replace(null);

  if (currentUserId) {
    void refreshRuntime();
    pollTimer = window.setInterval(() => void refreshRuntime(), POLL_INTERVAL_MS);
  }
}

export function initRuntime(): void {
  if (initialized) return;
  initialized = true;

  authStore.subscribe(syncRuntimeSession);
  window.addEventListener("online", () => void refreshRuntime());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshRuntime();
  });
  syncRuntimeSession();
}
