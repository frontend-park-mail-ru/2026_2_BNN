const STORAGE_KEY = "theme";
const SPRITE = "/assets/icons/ui/sprite.svg";

const THEME_ICONS = {
    light: "sunrise",
    dark: "sunset",
};

function readStoredTheme() {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

export function getTheme() {
    return readStoredTheme() === "dark" ? "dark" : "light";
}

export function getThemeIcon() {
    return THEME_ICONS[getTheme()];
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;

    try {
        localStorage.setItem(STORAGE_KEY, theme);
    } catch {
    }

    document.querySelectorAll("[data-theme-toggle] use").forEach((use) => {
        use.setAttribute("href", `${SPRITE}#${THEME_ICONS[theme]}`);
    });
}

export function initTheme() {
    document.documentElement.dataset.theme = getTheme();

    document.addEventListener("click", (event) => {
        if (!event.target.closest("[data-theme-toggle]")) {
            return;
        }

        applyTheme(getTheme() === "dark" ? "light" : "dark");
    });
}
