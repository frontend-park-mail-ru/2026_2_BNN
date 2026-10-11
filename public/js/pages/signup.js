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
} from "../utils/auth-form.js";

/**
 * SPA-страница регистрации.
 * Реализует render/mount/destroy контракт роутера.
 */
export const SignupPage = {
  /**
   * Рендерит HTML страницы регистрации.
   *
   * @returns {Promise<string>} Готовая HTML-строка страницы.
   */
  async render() {
    const template = Handlebars.templates["signup"];
    return template({ title: "Регистрация" });
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
   * Проверяет поле регистрации и показывает или снимает ошибку.
   * При проверке пароля заодно сверяет повтор пароля.
   *
   * @param {string} name Имя поля: `login`, `password` или `repeatPassword`.
   * @returns {boolean} `true`, если проверенные поля прошли проверку.
   */
  validateField(name) {
    const data = new FormData(this.form);
    const login = String(data.get("login") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const repeatPassword = String(data.get("repeatPassword") ?? "");
    
    const messages = {
      login: login.length < 3 || login.length > 20 ? "Логин должен быть от 3 до 20 символов" : "",
      password: password.length < 8 || password.length > 128 ? "Пароль должен быть от 8 до 128 символов" : "",
      repeatPassword: password !== repeatPassword ? "Пароли не совпадают" : "",
    };

    const names = name === "password" ? ["password", "repeatPassword"] : [name];
    let valid = true;

    for (const fieldName of names) {
      const message = messages[fieldName] ?? "";
      if (message) {
        setFormFieldError(this.form, fieldName, message);
        valid = false;
      } else {
        clearFormFieldError(this.form, fieldName);
      }
    }
    return valid;
  },

  /**
   * Обрабатывает отправку формы регистрации:
   * валидирует поля, вызывает API, сбрасывает кэш auth/notes и переводит пользователя на логин.
   *
   * @param {SubmitEvent} event Событие submit от формы.
   * @returns {Promise<void>}
   */
  async handleSubmit(event) {
    event.preventDefault();
    clearFormErrors(this.form);

    const loginOk = this.validateField("login");
    const passwordOk = this.validateField("password");
    const repeatPasswordOk = this.validateField("repeatPassword");
    if (!loginOk || !passwordOk || !repeatPasswordOk) {
      return;
    }

    const data = new FormData(this.form);
    const login = String(data.get("login") ?? "").trim();
    const password = String(data.get("password") ?? "");

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
