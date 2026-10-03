import { api } from "../api.js";
import { navigate } from "../router.js";

export const SignupPage = {
    async render() {
        const template = Handlebars.templates["signup"];
        return template({ title: "Регистрация" });
    },

    mount(root) {
        this.form = root.querySelector("form");
        this.onSubmit = (event) => this.handleSubmit(event);
        this.form.addEventListener("submit", this.onSubmit);
    },

    destroy() {
        this.form?.removeEventListener("submit", this.onSubmit);
        this.form = null;
        this.onSubmit = null;
    },

    async handleSubmit(event) {
        event.preventDefault();
        this.clearErrors();

        const data = new FormData(this.form);
        const login = String(data.get("login") ?? "").trim();
        const password = String(data.get("password") ?? "");
        const repeatPassword = String(data.get("repeatPassword") ?? "");
        let valid = true;

        if (login.length < 3 || login.length > 20) {
            this.setFieldError("login", "Логин должен быть от 3 до 20 символов");
            valid = false;
        }

        if (password.length < 8 || password.length > 128) {
            this.setFieldError("password", "Пароль должен быть от 8 до 128 символов");
            valid = false;
        }

        if (password !== repeatPassword) {
            this.setFieldError("repeatPassword", "Пароли не совпадают");
            valid = false;
        }

        if (!valid) {
            return;
        }

        const button = this.form.querySelector(".login-button");
        button.disabled = true;
        button.classList.add("is-loading");

        try {
            await api.signUp(login, password);
            await navigate("/login");
        } catch (error) {
            if (!this.form) {
                return;
            }

            if (error.status === 409) {
                this.setFieldError("login", error.message || "Такой логин уже занят");
            } else {
                this.setFeedback(error.status ? error.message : "Не удалось связаться с сервером");
            }
        } finally {
            if (!this.form) {
                return;
            }

            button.disabled = false;
            button.classList.remove("is-loading");
        }
    },

    clearErrors() {
        this.form.querySelectorAll(".field").forEach((field) => {
            field.classList.remove("has-error");
        });
        this.form.querySelectorAll(".field-error").forEach((error) => {
            error.textContent = "";
        });

        const feedback = this.form.querySelector(".form-feedback");
        feedback.textContent = "";
        feedback.classList.remove("is-error", "is-success");
    },

    setFieldError(name, message) {
        const error = this.form.querySelector(`[data-error-for="${name}"]`);
        error.textContent = message;
        error.closest(".field").classList.add("has-error");
    },

    setFeedback(message) {
        const feedback = this.form.querySelector(".form-feedback");
        feedback.textContent = message;
        feedback.classList.add("is-error");
    },
};