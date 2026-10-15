const STORAGE_KEY = "theme";
const SPRITE = "/assets/icons/ui/sprite.svg";

type Theme = "light" | "dark";

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

/**
 * Инициализирует тему и обработчик кнопки переключения.
 *
 * @returns {void}
 */
export function initTheme() {
  document.documentElement.dataset.theme = getTheme();

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest("[data-theme-toggle]")) {
      return;
    }
  
    applyTheme(getTheme() === "dark" ? "light" : "dark");
  });
}
