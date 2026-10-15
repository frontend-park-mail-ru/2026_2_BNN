import { api } from "../api.js";
import { navigate, resetAuthState } from "../router.js";
import {
  type AuthPage,
  type SubmitHandler,
  type InputHandler,
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

interface ApiError {
  status?: number;
  message?: string;
}

function isApiError(error: unknown): error is ApiError {
  if (typeof error != 'object' || error === null) {
    return false;
  }

  return 'status' in error && typeof (error as any).status === 'number';
}

const SIGNUP_FIELDS = ["login", "password", "repeatPassword"] as const;

type SignupField = (typeof SIGNUP_FIELDS)[number];

function isSignupField(name: string): name is SignupField {
  return (SIGNUP_FIELDS as readonly string[]).includes(name);
}

/**
 * SPA-страница регистрации.
 * Реализует render/mount/destroy контракт роутера.
 */
export class SignupPage implements AuthPage {
  form: HTMLFormElement | null = null;
  onSubmit: SubmitHandler | null = null;
  onInput: InputHandler | null = null;

  /**
   * Рендерит HTML страницы регистрации.
   *
   * @returns {Promise<string>} Готовая HTML-строка страницы.
   */
  async render(): Promise<string> {
    const template = Handlebars.templates["signup"];
    return template({ title: "Регистрация" });
  }

  /**
   * Подключает обработчики формы после вставки страницы в DOM.
   *
   * @param {ParentNode} root Корневой узел отрисованной страницы.
   * @returns {void}
   */
  mount(root: ParentNode): void {
    mountAuthForm(this, root);
  }

  /**
   * Снимает обработчики страницы при уходе с роута.
   *
   * @returns {void}
   */
  destroy(): void {
    destroyAuthForm(this);
  }

  /**
   * Проверяет поле регистрации и показывает или снимает ошибку.
   * При проверке пароля заодно сверяет повтор пароля.
   *
   * @param {string} name Имя поля: `login`, `password` или `repeatPassword`.
   * @param {string} value Текущее значение этого поля.
   * @returns {boolean} `true`, если проверенные поля прошли проверку.
   */
  validateField(name: string, value: string): boolean {
    const form = this.form;
    if (!form) {
      return false;
    }
    if (!isSignupField(name)) {
      return true;
    }

    const passwordInput = form.elements.namedItem("password") as HTMLInputElement;
    const repeatPasswordInput = form.elements.namedItem("repeatPassword") as HTMLInputElement;

    const password = name === "password" ? value : passwordInput.value;
    const repeatPassword = name === "repeatPassword" ? value : repeatPasswordInput.value;

    const messages: Record<SignupField, string> = {
      login: getLoginError(name === "login" ? value.trim() : ""),
      password: getPasswordError(name === "password" ? value : ""),
      repeatPassword: repeatPassword !== "" && password !== repeatPassword ? "Пароли не совпадают" : "",
    };

    const names: SignupField[] = name === "password" ? ["password", "repeatPassword"] : [name];
    let valid = true;

    for (const fieldName of names) {
      if (fieldName === "repeatPassword" && repeatPassword === "") {
        if (name === "repeatPassword") {
          setFormFieldError(form, fieldName, "Повторите пароль");
          valid = false;
        } else {
          clearFormFieldError(form, fieldName);
        }
        continue;
      }

      const message = messages[fieldName];
      if (message) {
        setFormFieldError(form, fieldName, message);
        valid = false;
      } else {
        clearFormFieldError(form, fieldName);
      }
    }
    return valid;
  }

  /**
   * Обрабатывает отправку формы регистрации:
   * валидирует поля, вызывает API, сбрасывает кэш auth/notes и переводит пользователя на логин.
   *
   * @param {SubmitEvent} event Событие submit от формы.
   * @returns {Promise<void>}
   */
  async handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    const form = this.form;
    if (!form) {
      return;
    }

    clearFormErrors(form);

    const loginInput = form.elements.namedItem("login") as HTMLInputElement;
    const passwordInput = form.elements.namedItem("password") as HTMLInputElement;
    const repeatPasswordInput = form.elements.namedItem("repeatPassword") as HTMLInputElement;

    const login = loginInput.value.trim();
    const password = passwordInput.value;
    const repeatPassword = repeatPasswordInput.value;

    const loginOk = this.validateField("login", login);
    const passwordOk = this.validateField("password", password);
    const repeatPasswordOk = this.validateField("repeatPassword", repeatPassword);

    if (!loginOk || !passwordOk || !repeatPasswordOk) {
      return;
    }

    setFormLoading(form, true);

    try {
      await api.signUp(login, password);
      resetAuthState();
      await navigate("/login");
    } catch (error) {
      if (!this.form) {
        return;
      }

      if (isApiError(error)) {
        if (error.status === 409) {
          setFormFieldError(this.form, "login", error.message ?? "Такой логин уже занят");
        } else {
          setFormFeedback(this.form, error.message ?? "Не удалось зарегистрироваться");
        }
      } else {
        setFormFeedback(this.form, "Не удалось связаться с сервером");
      }
    } finally {
      if (this.form) {
        setFormLoading(this.form, false);
      }
    }
  }
}
