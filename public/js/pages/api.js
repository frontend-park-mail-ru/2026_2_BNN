const API_URL = "http://localhost:5458";

async function request(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        }
    });

    if (!response.ok) {
        const error = new Error(`Ошибка запроса: ${response.status}`);
        error.response = response.status;
        throw error;
    }

    if (response.status === 204) {
        return null;
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
}

export function signUp(login, password) {
    return request("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ login, password }),
    });
}

export function logIn(login, password) {
    return request("/api/auth/signin", {
        method: "POST",
        body: JSON.stringify({ login, password }),
    });
}

export function getNotes(limit = 10, offset = 0) {
    return request(`/api/notes/getall?limit=${limit}&offset=${offset}`);
}

export function getNote(id) {
    return request(`/api/notes/${id}`);
}

export function getProfile() {
    return request("/api/users/me");
}

