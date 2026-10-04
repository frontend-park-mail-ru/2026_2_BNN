import { NotesPage, resetNotesStore } from "./pages/notes.js";
import { LoginPage } from "./pages/login.js";
import { SignupPage } from "./pages/signup.js";
import { NotFoundPage } from "./pages/notfound.js";
import { api } from "./api.js";

const routes = [
    { path: "/", page: NotesPage, auth: true },
    { path: "/notes", page: NotesPage, auth: true },
    { path: "/notes/favourites", page: NotesPage, auth: true },
    { path: "/notes/trash", page: NotesPage, auth: true },
    { path: "/notes/mail", page: NotesPage, auth: true },
    { path: "/notes/:id", page: NotesPage, auth: true },
    { path: "/login", page: LoginPage, guest: true },
    { path: "/signup", page: SignupPage, guest: true },
];


function matchRoute(pattern, path) {
    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = path.split("/").filter(Boolean);

    if (patternParts.length !== pathParts.length) {
        return null;
    }

    const params = {};

    for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(":")) {
            params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
        } else if (patternParts[i] !== pathParts[i]) {
            return null;
        }
    }

    return params;
}

let currentPage = null;
let renderId = 0;
let loggedIn = null;

async function ensureAuth() {
    if (loggedIn === true) {
        return true;
    }
    try {
        await api.getProfile();
        loggedIn = true;
    } catch (error) {
        loggedIn = false;
    }
    return loggedIn;
}

export async function router() {
    const path = window.location.pathname;
    let page = NotFoundPage;
    let params = {};
    let matchedRoute = null;

    for (const route of routes) {
        const match = matchRoute(route.path, path);

        if (match) {
            matchedRoute = route;
            page = route.page;
            params = match;
            break;
        }
    }

    if (matchedRoute?.auth) {
        const ok = await ensureAuth();
        if (!ok) {
            await navigate("/login");
            return;
        }
    }

    if (currentPage && currentPage.destroy) {
        currentPage.destroy();
    }
    currentPage = null;

    renderId++;
    const thisRender = renderId;

    const context = { path, params };
    const root = document.querySelector("#app");
    const html = await page.render(context);

    if (thisRender !== renderId) {
        return;
    }

    root.innerHTML = html;
    currentPage = page;

    if (page.mount) {
        page.mount(root, context);
    }
}

export async function navigate(url) {
    const currentPath = window.location.pathname + window.location.search + window.location.hash;
    
    if (url === currentPath) {
        return;
    }

    history.pushState(null, "", url);
    await router();
}

export function resetAuthState() {
    loggedIn = null;
    api.clearCachedProfile();
    resetNotesStore();
}

export function setupLinkHandling() {
    document.addEventListener("click", (event) => {
        const link = event.target.closest("a[data-link]");

        if (!link){
            return;
        }

        event.preventDefault();
        navigate(link.getAttribute("href"));
    });
}

export function setupPopStateHandling() {
    window.addEventListener("popstate", router);
}

export async function initRouter() {
    await router();
    setupLinkHandling();
    setupPopStateHandling();
}
