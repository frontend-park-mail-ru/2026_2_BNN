/**
 * Точка входа SPA: тема и клиентский роутер.
 */
import { initRouter } from "./router";
import "./styles/main.scss";
import { initTheme } from "./theme";

initTheme();
void initRouter();
