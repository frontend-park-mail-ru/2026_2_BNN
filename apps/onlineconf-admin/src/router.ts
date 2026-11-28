export type Route =
  { name: "catalog" } | { name: "new-key" } | { name: "key"; id: string } | { name: "not-found" };

const KEY_PATH =
  /^\/onlineconf\/keys\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

/** Сопоставляет адрес админки с маршрутом карточки или каталога. */
function resolveRoute(path: string): Route {
  if (path === "/onlineconf" || path === "/onlineconf/") return { name: "catalog" };
  if (path === "/onlineconf/keys/new") return { name: "new-key" };

  const match = path.match(KEY_PATH);
  return match ? { name: "key", id: match[1] } : { name: "not-found" };
}

/** Связывает маршруты админки с History API и учитывает запрет ухода с черновика. */
export function startRouter(render: (route: Route) => void, canLeave: () => boolean = () => true) {
  const events = new AbortController();
  let index = 0;
  let restoring = false;

  history.replaceState({ ...history.state, onlineconfIndex: index }, "");
  const show = () => render(resolveRoute(window.location.pathname));

  /** Записывает адрес в историю и открывает соответствующий экран. */
  function navigate(path: string, replace = false): void {
    if (!canLeave()) return;
    if (replace) history.replaceState({ ...history.state, onlineconfIndex: index }, "", path);
    else history.pushState({ onlineconfIndex: ++index }, "", path);
    show();
  }

  document.addEventListener(
    "click",
    (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      )
        return;
      const link = event.target.closest<HTMLAnchorElement>("a[data-onlineconf-link]");
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self"))
        return;
      const url = new URL(link.href);
      if (
        url.origin !== window.location.origin ||
        (url.pathname !== "/onlineconf" && !url.pathname.startsWith("/onlineconf/"))
      )
        return;
      event.preventDefault();
      navigate(url.pathname + url.search + url.hash);
    },
    { signal: events.signal }
  );

  window.addEventListener(
    "popstate",
    () => {
      if (restoring) {
        restoring = false;
        return;
      }
      const next: number | undefined = history.state?.onlineconfIndex;
      if (!canLeave()) {
        if (typeof next === "number" && next !== index) {
          restoring = true;
          history.go(index - next);
        }
        return;
      }
      index = next ?? 0;
      show();
    },
    { signal: events.signal }
  );

  show();
  return { navigate, destroy: () => events.abort() };
}
