import { setTheme } from "@/flux/ui/ui-actions";
import { uiStore } from "@/flux/ui/ui-store";
import type { Theme } from "@/flux/ui/ui-action-types";

import { transitionTheme } from "./transition";

const SPRITE = "/assets/icons/ui/sprite.svg";

const THEME_ICONS: Record<Theme, string> = {
  light: "sunrise",
  dark: "sunset",
};

const THEME_ASSETS = {
  logo: {
    light: "/assets/icons/logo-shape.svg",
    dark: "/assets/icons/logo-shape-dark.svg",
  },
  avatar: {
    light: "/assets/images/avatar-default.svg",
    dark: "/assets/images/avatar-default-dark.svg",
  },
} as const;

/**
 * Возвращает логотип или дефолтный аватар для активной темы приложения.
 * Цвет зашит в файл: картинка через `img` не видит `data-theme` на странице.
 *
 * @param kind `logo` или `avatar`.
 * @returns Путь к SVG текущей темы.
 */
export function themeAsset(kind: keyof typeof THEME_ASSETS): string {
  return THEME_ASSETS[kind][getTheme()];
}

/**
 * Меняет уже показанные логотип и дефолтный аватар. Загруженный аватар не трогает.
 *
 * @param theme Целевая тема.
 */
function syncThemeAssets(theme: Theme): void {
  document.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    const src = image.currentSrc || image.src;
    if (usesAsset(src, "logo")) {
      image.src = THEME_ASSETS.logo[theme];
    } else if (usesAsset(src, "avatar")) {
      image.src = THEME_ASSETS.avatar[theme];
    }
  });
}

/**
 * @param src Текущий адрес картинки, обычно абсолютный.
 * @param kind Какой набор файлов проверять.
 * @returns `true`, если адрес — светлая или тёмная версия этого ассета.
 */
function usesAsset(src: string, kind: keyof typeof THEME_ASSETS): boolean {
  return src.endsWith(THEME_ASSETS[kind].light) || src.endsWith(THEME_ASSETS[kind].dark);
}

/**
 * Возвращает активную тему интерфейса.
 */
export function getTheme(): Theme {
  return uiStore.getState().theme;
}

/**
 * Возвращает имя SVG-иконки для текущей темы.
 */
export function getThemeIcon(): string {
  return THEME_ICONS[getTheme()];
}

/**
 * Применяет тему к странице и синхронизирует иконки переключателя.
 *
 * @param theme Целевая тема.
 */
function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;

  document.querySelectorAll("[data-theme-toggle] use").forEach((use) => {
    use.setAttribute("href", `${SPRITE}#${THEME_ICONS[theme]}`);
  });
  syncThemeAssets(theme);
}

/**
 * Инициализирует тему и обработчик кнопки переключения.
 */
export function initTheme() {
  uiStore.subscribe(() => {
    const theme = getTheme();
    if (document.documentElement.dataset.theme !== theme) {
      applyTheme(theme);
    }
  });
  applyTheme(getTheme());

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest("[data-theme-toggle]");
    if (!button) {
      return;
    }

    const theme = getTheme() === "dark" ? "light" : "dark";
    void transitionTheme(button, theme, () => setTheme(theme));
  });
}
