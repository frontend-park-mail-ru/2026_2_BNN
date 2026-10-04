import { api } from "../api.js";
import { navigate, resetAuthState } from "../router.js";
import {
  mountAuthForm,
  destroyAuthForm,
  clearFormErrors,
  setFormFieldError,
  setFormFeedback,
  setFormLoading,
} from "./auth-form.js";

export const SignupPage = {
  async render() {
    const template = Handlebars.templates["signup"];
    return template({ title: "Регистрация" });
  },

  mount(root) {
    mountAuthForm(this, root);
  },

  destroy() {
    destroyAuthForm(this);
  },

  async handleSubmit(event) {
    event.preventDefault();
    clearFormErrors(this.form);

    const data = new FormData(this.form);
    const login = String(data.get("login") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const repeatPassword = String(data.get("repeatPassword") ?? "");
    let valid = true;

    if (login.length < 3 || login.length > 20) {
      setFormFieldError(this.form, "login", "Логин должен быть от 3 до 20 символов");
      valid = false;
    }

    if (password.length < 8 || password.length > 128) {
      setFormFieldError(this.form, "password", "Пароль должен быть от 8 до 128 символов");
      valid = false;
    }

    if (password !== repeatPassword) {
      setFormFieldError(this.form, "repeatPassword", "Пароли не совпадают");
      valid = false;
    }

    if (!valid) {
      return;
    }

    setFormLoading(this.form, true);

        try {
            await api.signUp(login, password);
            resetAuthState();
            await navigate("/login");
        } catch (error) {
            if (!this.form) {
                return;
            }

      if (error.status === 409) {
        setFormFieldError(this.form, "login", error.message || "Такой логин уже занят");
      } else {
        setFormFeedback(
          this.form,
          error.status ? error.message : "Не удалось связаться с сервером"
        );
      }
    } finally {
      if (this.form) {
        setFormLoading(this.form, false);
      }
    }
  },
};
