import { HomePage } from "./pages/home.js";
import { LoginPage } from "./pages/login.js";
import { SignupPage } from "./pages/signup.js";

const routes = {
    "/": HomePage,
    "/login": LoginPage,
    "/signup": SignupPage,
};

export function router() {
    const path = window.location.pathname;
    const page = routes[path] ?? HomePage;

    document.querySelector("#app").innerHTML = page.render();
}

export function navigate(url) {
    history.pushState(null, "", url);
    router();
}

export function setupLinkHandling() {
    document.addEventListener("click", (event) => {
        const link = event.target.closest("a[data-link]");

        if (!link){
            return;
        }

        event.preventDefault();
        navigate(link.pathname);
    });
}

export function setupPopStateHandling() {
    window.addEventListener("popstate", router);
}