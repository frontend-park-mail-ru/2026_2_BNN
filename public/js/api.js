class Api {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }

    async request(path, options = {}) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            ...options,
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...options.headers,
            }
        });
    
        if (!response.ok) {
            const text = await response.text();
            let message = `Ошибка запроса: ${response.status}`;

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
        });
    }
    
    logIn(login, password) {
        return this.request("/api/auth/signin", {
            method: "POST",
            body: JSON.stringify({ login, password }),
        });
    }
    
    getNotes(limit = 10, offset = 0) {
        return this.request(`/api/notes/getall?limit=${limit}&offset=${offset}`);
    }
    
    getNote(id) {
        return this.request(`/api/notes/${id}`);
    }
    
    getProfile() {
        return this.request("/api/users/me");
    }
}

export const api = new Api("http://localhost:5458")
