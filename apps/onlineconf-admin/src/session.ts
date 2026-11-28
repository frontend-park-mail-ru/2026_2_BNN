export type SessionResult =
  | { status: "authenticated"; user: { id: string; login: string } }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

function csrfHeaders(): Record<string, string> {
  const cookie = document.cookie.split(";").find((item) => item.trim().startsWith("bnn_csrf="));
  if (!cookie) return {};
  const value = cookie.trim().slice("bnn_csrf=".length);
  try {
    return { "X-CSRF-Token": decodeURIComponent(value) };
  } catch {
    return { "X-CSRF-Token": value };
  }
}

export async function getAdminSession(signal: AbortSignal): Promise<SessionResult> {
  const options: RequestInit = { credentials: "include", cache: "no-store", signal };
  const send = () => fetch("/api/onlineconf/admin/session", options);
  let response = await send();

  if (response.status === 401) {
    const refresh = await fetch("/api/auth/refresh", {
      ...options,
      method: "POST",
      headers: csrfHeaders(),
    });
    if (refresh.ok) response = await send();
    else if ([400, 401, 403].includes(refresh.status)) return { status: "unauthenticated" };
    else throw new Error("Session refresh failed");
  }

  if (response.status === 401) return { status: "unauthenticated" };
  if (response.status === 404 || response.status === 403) return { status: "unavailable" };
  if (response.status !== 200) throw new Error("Session check failed");

  const user: unknown = await response.json();
  if (
    typeof user !== "object" ||
    user === null ||
    !("id" in user) ||
    typeof user.id !== "string" ||
    !user.id ||
    !("login" in user) ||
    typeof user.login !== "string" ||
    !user.login
  ) {
    throw new Error("Invalid session response");
  }
  return { status: "authenticated", user: { id: user.id, login: user.login } };
}
