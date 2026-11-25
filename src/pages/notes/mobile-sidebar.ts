/** Переключает уже отрисованное дерево между выдвижной панелью и обычным сайдбаром. */
export function mountMobileSidebar(page: HTMLElement, signal: AbortSignal): void {
  const sidebar = page.querySelector<HTMLElement>("#notes-sidebar")!;
  const toggle = page.querySelector<HTMLButtonElement>(".header__drawer")!;
  const close = sidebar.querySelector<HTMLButtonElement>(".sidebar__close")!;
  const backdrop = page.querySelector<HTMLElement>(".sidebar-backdrop")!;
  const header = page.querySelector<HTMLElement>(".header")!;
  const main = page.querySelector<HTMLElement>("[data-notes-main]")!;
  const mobile = window.matchMedia("(max-width: 800px)");

  /**
   * Открывает или закрывает боковую панель на узком экране.
   * Пока панель открыта, шапка и редактор не получают фокус.
   *
   * @param open `true`, чтобы выдвинуть панель.
   */
  function setOpen(open: boolean): void {
    sidebar.classList.toggle("sidebar_open", open);
    sidebar.inert = mobile.matches && !open;
    header.inert = main.inert = open;
    backdrop.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) close.focus({ preventScroll: true });
  }

  /** Закрывает панель и возвращает фокус на кнопку в шапке. */
  function dismiss(): void {
    setOpen(false);
    toggle.focus({ preventScroll: true });
  }

  setOpen(false);
  toggle.addEventListener("click", () => setOpen(true), { signal });
  backdrop.addEventListener("click", dismiss, { signal });
  sidebar.addEventListener(
    "click",
    (event) => {
      if (
        mobile.matches &&
        event.target instanceof Element &&
        event.target.closest(
          ".sidebar__close, .sidebar__nav [data-link], [data-new-note], [data-tags-manage]"
        )
      )
        dismiss();
    },
    { signal }
  );
  page.addEventListener(
    "keydown",
    (event) => {
      if (!backdrop.hidden && event.key === "Escape") {
        event.stopImmediatePropagation();
        dismiss();
      }
    },
    { signal }
  );
  mobile.addEventListener("change", () => setOpen(false), { signal });
}
