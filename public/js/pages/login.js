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

export const LoginPage = {
  async render() {
    const template = Handlebars.templates["login"];
    return template({ title: "Авторизация" });
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
    let valid = true;

    if (login.length < 3 || login.length > 20) {
      setFormFieldError(this.form, "login", "Логин должен быть от 3 до 20 символов");
      valid = false;
    }

    if (password.length < 8 || password.length > 128) {
      setFormFieldError(this.form, "password", "Пароль должен быть от 8 до 128 символов");
      valid = false;
    }

    if (!valid) {
      return;
    }

    setFormLoading(this.form, true);

<<<<<<< HEAD
    try {
      await api.logIn(login, password);
      await api.getProfile();
      await navigate("/");
    } catch (error) {
      if (!this.form) {
        return;
      }
=======
        try {
            await api.logIn(login, password);
            resetAuthState();
            await navigate("/");
        } catch (error) {
            if (!this.form) {
                return;
            }
>>>>>>> eb52fe4500ad1894594e48c0ad072c68b270b4e5

      if (error.status === 401) {
        setFormFieldError(this.form, "password", "Неверный логин или пароль");
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
