/**
 * Точка входа SPA: тема и клиентский роутер.
 */
import { initRouter } from "./router";
import "./styles/main.scss";
import { initTheme } from "./theme";

initTheme();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js").catch(() => null);
}

void initRouter();
