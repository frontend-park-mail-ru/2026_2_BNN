import { api } from "../api.js";
import { navigate, resetAuthState } from "../router.js";
import {
  mountAuthForm,
  destroyAuthForm,
  clearFormErrors,
  setFormFieldError,
  setFormFeedback,
  setFormLoading,
} from "../utils/auth-form.js";

/**
 * SPA-страница авторизации.
 * Реализует render/mount/destroy контракт роутера.
 */
export const LoginPage = {
  /**
   * Рендерит HTML страницы авторизации.
   *
   * @returns {Promise<string>} Готовая HTML-строка страницы.
   */
  async render() {
    const template = Handlebars.templates["login"];
    return template({ title: "Авторизация" });
  },

  /**
   * Подключает обработчики формы после вставки страницы в DOM.
   *
   * @param {ParentNode} root Корневой узел отрисованной страницы.
   * @returns {void}
   */
  mount(root) {
    mountAuthForm(this, root);
  },

  /**
   * Снимает обработчики страницы при уходе с роута.
   *
   * @returns {void}
   */
  destroy() {
    destroyAuthForm(this);
  },

  /**
   * Обрабатывает отправку формы логина:
   * валидирует поля, вызывает API, сбрасывает кэш auth/notes и перенаправляет пользователя.
   *
   * @param {SubmitEvent} event Событие submit от формы.
   * @returns {Promise<void>}
   */
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

    try {
      await api.logIn(login, password);
      resetAuthState();
      await navigate("/");
    } catch (error) {
      if (!this.form) {
        return;
      }

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
