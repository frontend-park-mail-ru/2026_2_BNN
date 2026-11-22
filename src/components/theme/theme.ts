import { setTheme } from "@/flux/ui/ui-actions";
import { uiStore } from "@/flux/ui/ui-store";
import type { Theme } from "@/flux/ui/ui-action-types";

const SPRITE = "/assets/icons/ui/sprite.svg";

let themeTransitionRunning = false;

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
 * Переключает тему круговым переходом от кнопки. Без View Transitions тема меняется сразу.
 *
 * @param button Кнопка, из центра которой расходится переход.
 */
async function transitionTheme(button: Element): Promise<void> {
  if (themeTransitionRunning) {
    return;
  }

  const theme = getTheme() === "dark" ? "light" : "dark";

  if (
    !document.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    setTheme(theme);
    return;
  }

  themeTransitionRunning = true;
  const root = document.documentElement;
  const rect = button.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  let animation: Animation | undefined;

  root.dataset.themeTransition = "circle";

  try {
    const transition = document.startViewTransition(() => {
      setTheme(theme);
    });

    try {
      await transition.ready;

      const circle = [`circle(${radius}px at ${x}px ${y}px)`, `circle(0px at ${x}px ${y}px)`];

      animation = root.animate(
        {
          clipPath: theme === "light" ? circle.reverse() : circle,
        },
        {
          duration: 900,
          easing: "ease-in-out",
          fill: "forwards",
          pseudoElement:
            theme === "light"
              ? "::view-transition-new(theme-page)"
              : "::view-transition-old(theme-page)",
        }
      );

      await animation.finished;
    } catch {
      transition.skipTransition();
    }

    await transition.finished;
  } finally {
    animation?.cancel();
    delete root.dataset.themeTransition;
    themeTransitionRunning = false;
  }
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

    void transitionTheme(button);
  });
}
