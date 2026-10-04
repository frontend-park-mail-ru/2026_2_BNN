const LOCAL_API_URL = "http://localhost:5458";

const DEFAULT_ERROR_MESSAGES = {
    400: "Проверьте введённые данные",
    401: "Нужно войти в аккаунт",
    404: "Ничего не найдено",
    413: "Слишком большой запрос",
};

const SERVER_ERROR_MESSAGE = "Ошибка сервера, попробуйте позже";
let cachedProfile = null;

function getApiUrl() {
    if (window.location.hostname === "localhost") {
        return LOCAL_API_URL;
    }
    return "";
}

function getErrorMessage(status, messages) {
    return messages[status] ??
    
    DEFAULT_ERROR_MESSAGES[status] ??
    
    (status >= 500 ? SERVER_ERROR_MESSAGE : null) ??
    
    `Ошибка запроса: ${status}`;
}

class Api {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }

    async request(path, options = {}, messages = {}) {
        const headers = { ...options.headers };

        if (options.body) {
            headers["Content-Type"] = "application/json";
        }

        const response = await fetch(`${this.baseUrl}${path}`, {
            ...options,
            credentials: "include",
            headers: headers,
        });

        if (!response.ok) {
            const text = await response.text();
            let message = getErrorMessage(response.status, messages);

            if (text) {
                try {
                    const data = JSON.parse(text);
                    if (data.message) {
                        message = data.message;
                    }
                } catch {
                    message = text;
                }
            }

            const error = new Error(message);
            error.status = response.status;
            throw error;
        }

        if (response.status === 204) {
            return null;
        }

        const text = await response.text();

        if (!text) {
            return null;
        }

        try {
            return JSON.parse(text);
        } catch {
            throw new Error("Сервер вернул некорректный JSON");
        }
    }

    signUp(login, password) {
        return this.request("/api/auth/signup", {
            method: "POST",
            body: JSON.stringify({ login, password }),
        }, {
            400: "Логин 3–20 символов, пароль 8–128 символов",
            409: "Такой логин уже занят",
        });
    }

    logIn(login, password) {
        return this.request("/api/auth/signin", {
            method: "POST",
            body: JSON.stringify({ login, password }),
        }, {
            401: "Неверный логин или пароль",
        });
    }

    getNotes(limit = 10, offset = 0) {
        return this.request(`/api/notes/getall?limit=${limit}&offset=${offset}`);
    }

    getNote(id) {
        return this.request(`/api/notes/${encodeURIComponent(id)}`, {}, {
            400: "Некорректный адрес заметки",
            404: "Заметка не найдена",
        });
    }

    getProfile() {
        return this.request("/api/users/me").then((profile) => {
            cachedProfile = profile;
            return profile;
        });
    }

    getCachedProfile() {
        return cachedProfile;
    }

    clearCachedProfile() {
        cachedProfile = null;
    }
}

export const api = new Api(getApiUrl());
