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
   * @param {string} value Текущее значение этого поля.
   * @returns {boolean} `true`, если проверенные поля прошли проверку.
   */
  validateField(name, value) {
    const password = name === "password" ? value : this.form.elements.password.value;
    const repeatPassword =
      name === "repeatPassword" ? value : this.form.elements.repeatPassword.value;
    const messages = {
      login: getLoginError(name === "login" ? value.trim() : ""),
      password: getPasswordError(name === "password" ? value : ""),
      repeatPassword:
        repeatPassword !== "" && password !== repeatPassword ? "Пароли не совпадают" : "",
    };

    const names = name === "password" ? ["password", "repeatPassword"] : [name];
    let valid = true;

    for (const fieldName of names) {
      if (fieldName === "repeatPassword" && repeatPassword === "") {
        if (name === "repeatPassword") {
          setFormFieldError(this.form, fieldName, "Повторите пароль");
          valid = false;
          continue;
        } else {
          clearFormFieldError(this.form, fieldName);
        }
        continue;
      }
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

    const login = this.form.elements.login.value.trim();
    const password = this.form.elements.password.value;
    const repeatPassword = this.form.elements.repeatPassword.value;
    const loginOk = this.validateField("login", login);
    const passwordOk = this.validateField("password", password);
    const repeatPasswordOk = this.validateField("repeatPassword", repeatPassword);

    if (!loginOk || !passwordOk || !repeatPasswordOk) {
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
