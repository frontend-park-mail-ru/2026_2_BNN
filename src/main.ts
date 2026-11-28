/**
 * Точка входа SPA: тема и клиентский роутер.
 */
import { initRouter } from "@/router";
import "@/styles/main.scss";
import { initTheme } from "@/components/theme/theme";
import { registerInlineFormatHelper } from "@/pages/notes/editor/inline-format";
import { initUi } from "@/flux/ui/ui-actions";
import { initRuntime } from "@/flux/runtime/runtime-actions";

registerInlineFormatHelper();
initUi();
initTheme();
initRuntime();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js").catch(() => null);
}

void initRouter();
