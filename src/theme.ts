const STORAGE_KEY = "theme";
const SPRITE = "/assets/icons/ui/sprite.svg";

type Theme = "light" | "dark";

let themeTransitionRunning = false;

const THEME_ICONS: Record<Theme, string> = {
  light: "sunrise",
  dark: "sunset",
};

/**
 * Читает сохраненную тему из localStorage.
 *
 * @returns {string | null}
 */
function readStoredTheme(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Возвращает активную тему интерфейса.
 *
 * @returns {"light" | "dark"}
 */
export function getTheme(): Theme {
  return readStoredTheme() === "dark" ? "dark" : "light";
}

/**
 * Возвращает имя SVG-иконки для текущей темы.
 *
 * @returns {string}
 */
export function getThemeIcon(): string {
  return THEME_ICONS[getTheme()];
}

/**
 * Применяет тему к странице и синхронизирует иконки переключателя.
 *
 * @param {"light" | "dark"} theme Целевая тема.
 * @returns {void}
 */
function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Ignore storage errors (private mode, quota, disabled storage).
  }

  document.querySelectorAll("[data-theme-toggle] use").forEach((use) => {
    use.setAttribute("href", `${SPRITE}#${THEME_ICONS[theme]}`);
  });
}

async function transitionTheme(button: Element): Promise<void> {
  if (themeTransitionRunning) {
    return;
  }

  const theme = getTheme() === "dark" ? "light" : "dark";

  if (
    !document.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    applyTheme(theme);
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
      applyTheme(theme);
    });

    try {
      await transition.ready;

      const circle = [
        `circle(${radius}px at ${x}px ${y}px)`,
        `circle(0px at ${x}px ${y}px)`,
      ];

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
 *
 * @returns {void}
 */
export function initTheme() {
  document.documentElement.dataset.theme = getTheme();

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
