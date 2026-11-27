import { rangeRect } from "@/pages/notes/editor/caret";

interface RemoteCursor {
  blockId: string;
  offset: number;
  marker: HTMLElement;
  label: HTMLElement;
  highlights: HTMLElement;
  selection?: { start: number; end: number };
}

export function createRemoteCursors(mainRegion: HTMLElement) {
  const cursors = new Map<string, RemoteCursor>();
  const events = new AbortController();
  const layer = document.createElement("div");
  layer.className = "remote-cursors";
  layer.setAttribute("aria-hidden", "true");
  layer.hidden = true;
  (mainRegion.closest(".notes") ?? document.body).append(layer);
  let frame = 0;

  function rangeAt(text: HTMLElement, offset: number): Range | null {
    const range = document.createRange();
    range.selectNodeContents(text);
    range.collapse(true);
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let remaining = offset;
    let found = offset === 0;

    while (node) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) {
        range.setStart(node, remaining);
        range.collapse(true);
        found = true;
        break;
      }
      remaining -= length;
      node = walker.nextNode();
    }

    return found ? range : null;
  }

  function render(): void {
    const content = mainRegion.querySelector<HTMLElement>(".notebook__content");
    layer.hidden = !content || cursors.size === 0;
    if (!content) return;

    const box = content.getBoundingClientRect();
    const left = box.left + content.clientLeft;
    const top = box.top + content.clientTop;
    Object.assign(layer.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${content.clientWidth}px`,
      height: `${content.clientHeight}px`,
    });

    for (const cursor of cursors.values()) {
      cursor.highlights.replaceChildren();

      const text = mainRegion.querySelector<HTMLElement>(
        `[data-block-id="${CSS.escape(cursor.blockId)}"] [data-block-text]`
      );

      const caret = text ? rangeAt(text, cursor.offset) : null;
      const rect = caret && text ? (rangeRect(caret) ?? text.getBoundingClientRect()) : null;

      cursor.marker.hidden = !rect;
      if (!rect || !text) continue;

      Object.assign(cursor.marker.style, {
        left: `${rect.left - left}px`,
        top: `${rect.top - top}px`,
        height: `${rect.height}px`,
      });

      if (!cursor.selection) continue;

      const start = rangeAt(text, cursor.selection.start);
      const end = rangeAt(text, cursor.selection.end);
      if (!start || !end) continue;

      start.setEnd(end.startContainer, end.startOffset);

      for (const selectionRect of start.getClientRects()) {
        if (!selectionRect.width || !selectionRect.height) continue;

        const highlight = document.createElement("div");
        highlight.className = "remote-selection";

        Object.assign(highlight.style, {
          left: `${selectionRect.left - left}px`,
          top: `${selectionRect.top - top}px`,
          width: `${selectionRect.width}px`,
          height: `${selectionRect.height}px`,
        });

        cursor.highlights.append(highlight);
      }
    }
  }

  function schedule(): void {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }

  const observer = new MutationObserver(schedule);
  observer.observe(mainRegion, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-block-id"],
  });
  document.addEventListener("scroll", schedule, { capture: true, signal: events.signal });
  window.addEventListener("resize", schedule, { signal: events.signal });

  function clear(): void {
    cursors.clear();
    layer.replaceChildren();
    layer.hidden = true;
  }

  return {
    update(userId: string, payload: unknown): void {
      if (!payload || typeof payload !== "object") return;
      const data = payload as Record<string, unknown>;
      if (
        typeof data.block_id !== "string" ||
        typeof data.offset !== "number" ||
        !Number.isSafeInteger(data.offset) ||
        data.offset < 0
      )
        return;

      let cursor = cursors.get(userId);
      if (!cursor) {
        const marker = document.createElement("div");
        marker.className = "remote-cursor";

        const label = document.createElement("span");
        label.className = "remote-cursor__label";
        marker.append(label);
        layer.append(marker);

        const highlights = document.createElement("div");
        highlights.className = "remote-selections";
        layer.prepend(highlights);

        const colors = ["#73b0ff", "#b9a0ef", "#79c6a5", "#e2c27b"];
        const hash = [...userId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
        const color = colors[hash % colors.length];

        marker.style.setProperty("--cursor-color", color);
        highlights.style.setProperty("--cursor-color", color);

        cursor = { marker, label, highlights, blockId: data.block_id, offset: data.offset };
        cursors.set(userId, cursor);
      }

      cursor.blockId = data.block_id;
      cursor.offset = data.offset;
      cursor.selection = undefined;

      if (data.selection && typeof data.selection === "object") {
        const bounds = data.selection as Record<string, unknown>;

        if (
          typeof bounds.start === "number" &&
          typeof bounds.end === "number" &&
          Number.isSafeInteger(bounds.start) &&
          Number.isSafeInteger(bounds.end) &&
          bounds.start >= 0 &&
          bounds.end > bounds.start
        ) {
          cursor.selection = { start: bounds.start, end: bounds.end };
        }
      }
      cursor.label.textContent =
        typeof data.user_name === "string" && data.user_name
          ? data.user_name.slice(0, 40)
          : "Участник";
      schedule();
    },
    remove(userId: string): void {
      const cursor = cursors.get(userId);
      cursor?.marker.remove();
      cursor?.highlights.remove();
      cursors.delete(userId);
      schedule();
    },
    clear,
    destroy(): void {
      events.abort();
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      clear();
      layer.remove();
    },
  };
}
