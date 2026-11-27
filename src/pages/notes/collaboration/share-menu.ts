export function mountShareMenu(options: {
  page: HTMLElement;
  getNoteId: () => string | undefined;
  getTitle: () => string;
  showToast: (message: string, isError?: boolean) => void;
}) {
  const events = new AbortController();
  const getMenu = () => options.page.querySelector<HTMLDetailsElement>("[data-share-menu]");

  function close(restoreFocus = false): void {
    const menu = getMenu();
    if (!menu?.open) return;
    menu.open = false;
    if (restoreFocus) menu.querySelector<HTMLElement>("summary")?.focus();
  }

  options.page.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.closest("[data-collaboration-open]")) {
        close(true);
        return;
      }

      const provider = target.closest<HTMLElement>("[data-share-provider]")?.dataset.shareProvider;
      if (provider !== "telegram" && provider !== "vk" && provider !== "whatsapp") return;

      const id = options.getNoteId();
      if (!id || id === "new") {
        close(true);
        options.showToast("Сначала сохраните заметку");
        return;
      }

      const noteUrl = new URL(`/notes/${encodeURIComponent(id)}`, window.location.origin);
      const title = options.getTitle().trim() || "Без названия";
      const destinations = {
        telegram: "https://t.me/share/url",
        vk: "https://vk.com/share.php",
        whatsapp: "https://wa.me/",
      };
      const destination = new URL(destinations[provider]);

      if (provider === "whatsapp") {
        destination.searchParams.set("text", `${title}\n${noteUrl.href}`);
      } else {
        destination.searchParams.set("url", noteUrl.href);
        if (provider === "telegram") destination.searchParams.set("text", title);
      }

      close();
      window.open(destination.href, "_blank", "noopener,noreferrer");
    },
    { signal: events.signal }
  );

  document.addEventListener(
    "pointerdown",
    (event) => {
      const menu = getMenu();
      if (event.target instanceof Node && menu?.open && !menu.contains(event.target)) close();
    },
    { signal: events.signal }
  );

  options.page.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && getMenu()?.open) {
        event.preventDefault();
        close(true);
      }
    },
    { signal: events.signal }
  );

  return {
    close,
    destroy(): void {
      events.abort();
      close();
    },
  };
}
