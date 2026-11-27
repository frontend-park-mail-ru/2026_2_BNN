import { api, ApiError } from "@/api";

export interface NoteSocketMessage {
  type: "note_updated" | "cursor_move" | "user_joined" | "user_left";
  note_id: string;
  user_id?: string;
  payload?: unknown;
}

export interface NoteCursor {
  block_id: string;
  offset: number;
  selection?: { start: number; end: number };
  user_name: string;
}

function parseMessage(data: unknown, noteId: string): NoteSocketMessage | null {
  if (typeof data !== "string") return null;

  let value: unknown;

  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }

  if (!value || typeof value !== "object") return null;

  const message = value as Record<string, unknown>;

  if (
    message.note_id !== noteId ||
    (message.user_id !== undefined && typeof message.user_id !== "string") ||
    (message.type !== "note_updated" &&
      message.type !== "cursor_move" &&
      message.type !== "user_joined" &&
      message.type !== "user_left")
  ) {
    return null;
  }

  return {
    type: message.type,
    note_id: noteId,
    user_id: message.user_id,
    payload: message.payload,
  };
}

export function connectNoteSocket(
  noteId: string,
  options: {
    onMessage: (message: NoteSocketMessage) => void;
    onUnavailable: (status: number) => void;
    onOpen?: () => void;
    onDisconnect?: () => void;
  }
) {
  let stopped = false;
  let socket: WebSocket | null = null;
  let timer: number | undefined;
  let retryDelay = 1000;

  function retry(): void {
    if (stopped) return;

    timer = window.setTimeout(() => void connect(), retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30000);
  }

  async function connect(): Promise<void> {
    try {
      await api.getNote(noteId);

      if (stopped) return;

      const current = api.openNoteSocket(noteId);
      socket = current;

      current.addEventListener("open", () => {
        retryDelay = 1000;
        options.onOpen?.();
      });

      current.addEventListener("message", (event) => {
        if (stopped || socket !== current) return;

        const message = parseMessage(event.data, noteId);

        if (message) options.onMessage(message);
      });

      current.addEventListener("close", () => {
        if (stopped || socket !== current) return;

        socket = null;
        options.onDisconnect?.();
        retry();
      });
    } catch (error) {
      if (stopped) return;

      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        stopped = true;
        options.onUnavailable(error.status);
        return;
      }

      retry();
    }
  }

  void connect();

  return {
    sendCursor(cursor: NoteCursor): boolean {
      if (socket?.readyState !== WebSocket.OPEN) return false;

      socket.send(JSON.stringify({ type: "cursor_move", note_id: noteId, payload: cursor }));
      return true;
    },
    close(): void {
      stopped = true;
      window.clearTimeout(timer);
      socket?.close();
      socket = null;
    },
  };
}
