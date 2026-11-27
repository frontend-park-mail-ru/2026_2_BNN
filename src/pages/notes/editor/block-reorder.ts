type DropEdge = "before" | "after";

interface DragState {
  pointerId: number;
  handle: HTMLButtonElement;
  block: HTMLElement;
  body: HTMLElement;
  scroller: HTMLElement;

  startX: number;
  startY: number;
  x: number;
  y: number;

  moving: boolean;
  target: HTMLElement | null;
  edge: DropEdge;
}

const DRAG_THRESHOLD = 5;
const SCROLL_ZONE = 48;

export function mountBlockReorder(
  mainRegion: HTMLElement,
  scheduleSave: () => void,
  signal: AbortSignal
): () => void {
  let drag: DragState | null = null;
  let frame = 0;

  /** Убирает линию со старого блока и показывает её на новом. */
  function markTarget(
    state: DragState,
    target: HTMLElement | null,
    edge: DropEdge = "before"
  ): void {
    if (state.target === target && state.edge === edge) return;

    state.target?.removeAttribute("data-drop-edge");
    state.target = target;
    state.edge = edge;

    if (target) target.dataset.dropEdge = edge;
  }

  /** Находит границу между блоками, ближайшую к указателю по вертикали. */
  function updateTarget(state: DragState): void {
    const bounds = state.scroller.getBoundingClientRect();

    if (
      state.x < bounds.left ||
      state.x > bounds.right ||
      state.y < bounds.top ||
      state.y > bounds.bottom
    ) {
      markTarget(state, null);
      return;
    }

    let last: HTMLElement | null = null;

    for (const child of state.body.children) {
      if (!(child instanceof HTMLElement) || !child.hasAttribute("data-block")) {
        continue;
      }

      const rect = child.getBoundingClientRect();

      if (state.y < rect.top + rect.height / 2) {
        // Вставить перед самим собой или перед своим следующим соседом
        // означает оставить порядок прежним.
        const unchanged = child === state.block || child === state.block.nextElementSibling;
        markTarget(state, unchanged ? null : child, "before");
        return;
      }

      last = child;
    }

    markTarget(state, last === state.block ? null : last, "after");
  }

  /** Прокручивает редактор, пока указатель удерживается около его края. */
  function autoScroll(): void {
    frame = 0;
    const state = drag;
    if (!state?.moving) return;

    if (!mainRegion.contains(state.block)) {
      cancel();
      return;
    }

    const rect = state.scroller.getBoundingClientRect();
    const zone = Math.min(SCROLL_ZONE, rect.height / 3);
    let step = 0;

    if (
      zone > 0 &&
      state.x >= rect.left &&
      state.x <= rect.right &&
      state.y >= rect.top &&
      state.y <= rect.bottom
    ) {
      const fromTop = state.y - rect.top;
      const fromBottom = rect.bottom - state.y;

      if (fromTop < zone) {
        step = -Math.ceil(12 * (1 - fromTop / zone));
      } else if (fromBottom < zone) {
        step = Math.ceil(12 * (1 - fromBottom / zone));
      }
    }

    if (!step) return;

    const previousTop = state.scroller.scrollTop;
    state.scroller.scrollTop += step;

    if (state.scroller.scrollTop !== previousTop) {
      updateTarget(state);
      frame = requestAnimationFrame(autoScroll);
    }
  }

  /** Завершает жест без изменения порядка. Используется также при смене заметки. */
  function cancel(): void {
    cancelAnimationFrame(frame);
    frame = 0;

    const state = drag;
    drag = null;
    if (!state) return;

    state.target?.removeAttribute("data-drop-edge");
    state.block.removeAttribute("data-moving");

    if (state.handle.hasPointerCapture(state.pointerId)) {
      state.handle.releasePointerCapture(state.pointerId);
    }
  }

  function onPointerDown(event: PointerEvent): void {
    if (drag || !event.isPrimary || event.button !== 0) return;
    if (!(event.target instanceof Element)) return;

    const handle = event.target.closest<HTMLButtonElement>("[data-block-handle]");
    const block = handle?.closest<HTMLElement>("[data-block]");
    const body = block?.parentElement;
    const scroller = body?.closest<HTMLElement>(".notebook__content");

    if (!handle || !block || !body?.matches("[data-note-body]") || !scroller) return;

    event.preventDefault();
    handle.setPointerCapture(event.pointerId);

    drag = {
      pointerId: event.pointerId,
      handle,
      block,
      body,
      scroller,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moving: false,
      target: null,
      edge: "before",
    };
  }

  function onPointerMove(event: PointerEvent): void {
    const state = drag;
    if (!state || state.pointerId !== event.pointerId) return;

    state.x = event.clientX;
    state.y = event.clientY;

    if (!state.moving) {
      const distance = Math.hypot(state.x - state.startX, state.y - state.startY);
      if (distance < DRAG_THRESHOLD) return;

      state.moving = true;
      state.block.toggleAttribute("data-moving", true);
    }

    updateTarget(state);
    if (!frame) frame = requestAnimationFrame(autoScroll);
  }

  function onPointerUp(event: PointerEvent): void {
    const state = drag;
    if (!state || state.pointerId !== event.pointerId) return;

    if (state.moving) {
      state.x = event.clientX;
      state.y = event.clientY;
      updateTarget(state);
    }

    const { block, body, target, edge } = state;
    cancel();

    if (
      !target ||
      !mainRegion.contains(body) ||
      block.parentElement !== body ||
      target.parentElement !== body
    ) {
      return;
    }

    if (edge === "before") target.before(block);
    else target.after(block);

    scheduleSave();
  }

  function onPointerCancel(event: PointerEvent): void {
    if (drag?.pointerId === event.pointerId) cancel();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && drag) {
      event.preventDefault();
      cancel();
      return;
    }

    if (!(event.target instanceof HTMLButtonElement)) return;
    if (!event.target.matches("[data-block-handle]")) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;

    event.preventDefault();
    const block = event.target.closest<HTMLElement>("[data-block]");
    if (!block) return;

    const up = event.key === "ArrowUp";
    const neighbor = up ? block.previousElementSibling : block.nextElementSibling;
    if (!neighbor?.matches("[data-block]")) return;

    if (up) neighbor.before(block);
    else neighbor.after(block);

    event.target.focus({ preventScroll: true });
    block.scrollIntoView({ block: "nearest" });
    scheduleSave();
  }

  mainRegion.addEventListener("pointerdown", onPointerDown, { signal });
  mainRegion.addEventListener("pointermove", onPointerMove, { signal });
  mainRegion.addEventListener("pointerup", onPointerUp, { signal });
  mainRegion.addEventListener("pointercancel", onPointerCancel, { signal });
  mainRegion.addEventListener("lostpointercapture", onPointerCancel, { signal });
  mainRegion.addEventListener("keydown", onKeyDown, { signal });
  window.addEventListener("blur", cancel, { signal });
  signal.addEventListener("abort", cancel, { once: true });

  return cancel;
}
