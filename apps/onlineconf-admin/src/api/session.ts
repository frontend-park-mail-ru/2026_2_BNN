import { ApiError, getSession } from "./api";
import type { AdminUser } from "../types/onlineconf";

export type SessionResult =
  | { status: "authenticated"; user: AdminUser }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

export async function getAdminSession(signal: AbortSignal): Promise<SessionResult> {
  try {
    return { status: "authenticated", user: await getSession(signal) };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) return { status: "unauthenticated" };
      if (error.code === "NOT_FOUND" && (error.status === 403 || error.status === 404)) {
        return { status: "unavailable" };
      }
    }
    throw error;
  }
}
