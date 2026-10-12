import { api } from "../api.js";
import { navigate, resetAuthState } from "../router.js";
import {
  mountAuthForm,
  destroyAuthForm,
  clearFormErrors,
  setFormFieldError,
  clearFormFieldError,
  setFormFeedback,
  setFormLoading,
  getLoginError,
  getPasswordError,
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
   * Проверяет одно поле логина и показывает или снимает ошибку.
   *
   * @param {string} name Имя поля: `login` или `password`.
   * @param {string} value Текущее значение этого поля.
   * @returns {boolean} `true`, если поле прошло проверку.
   */
  validateField(name, value) {
    const message = name === "login" ? getLoginError(value.trim()) : getPasswordError(value);

    if (message) {
      setFormFieldError(this.form, name, message);
    } else {
      clearFormFieldError(this.form, name);
    }
    return message === "";
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

    const login = this.form.elements.login.value.trim();
    const password = this.form.elements.password.value;
    const loginOk = this.validateField("login", login);
    const passwordOk = this.validateField("password", password);

    if (!loginOk || !passwordOk) {
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
