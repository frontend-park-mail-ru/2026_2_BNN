import { NotesPage } from "./pages/notes.js";
import { LoginPage } from "./pages/login.js";
import { SignupPage } from "./pages/signup.js";
import { NotFoundPage } from "./pages/notfound.js";

const routes = {
    "/": NotesPage,
    "/notes": NotesPage,
    "/login": LoginPage,
    "/signup": SignupPage,
};

export async function router() {
    const path = window.location.pathname;
    const page = routes[path] ?? NotFoundPage;

    document.querySelector("#app").innerHTML = await page.render();
}

export async function navigate(url) {
    const currentPath = window.location.pathname + window.location.search + window.location.hash;
    
    if (url === currentPath) {
        return;
    }

    history.pushState(null, "", url);
    await router();
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