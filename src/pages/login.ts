import { api } from "../api";
import { navigate, resetAuthState } from "../router";
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
} from "../utils/auth-form";

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

/**
 * SPA-страница авторизации.
 * Реализует render/mount/destroy контракт роутера.
 */
export class LoginPage implements AuthPage {
  form: HTMLFormElement | null = null;
  onSubmit: SubmitHandler | null = null;
  onInput: InputHandler | null = null;

  /**
   * Рендерит HTML страницы авторизации.
   *
   * @returns {Promise<string>} Готовая HTML-строка страницы.
   */
  async render(): Promise<string> {
    const template = Handlebars.templates["login"];
    return template({ title: "Авторизация" });
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
   * Проверяет одно поле логина и показывает или снимает ошибку.
   *
   * @param {string} name Имя поля: `login` или `password`.
   * @param {string} value Текущее значение этого поля.
   * @returns {boolean} `true`, если поле прошло проверку.
   */
  validateField(name: string, value: string): boolean {
    const message = name === "login" ? getLoginError(value.trim()) : getPasswordError(value);

    const form = this.form;
    if (!form) {
      return false;
    }

    if (message) {
      setFormFieldError(form, name, message);
    } else {
      clearFormFieldError(form, name);
    }
    return message === "";
  }

  /**
   * Обрабатывает отправку формы логина:
   * валидирует поля, вызывает API, сбрасывает кэш auth/notes и перенаправляет пользователя.
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

    const login = loginInput.value.trim();
    const password = passwordInput.value;

    const loginOk = this.validateField("login", login);
    const passwordOk = this.validateField("password", password);

    if (!loginOk || !passwordOk) {
      return;
    }

    setFormLoading(form, true);

    try {
      await api.logIn(login, password);
      resetAuthState();
      await navigate("/");
    } catch (error) {
      if (!this.form) {
        return;
      }

      if (isApiError(error)) { 
        if (error.status === 401) {
          setFormFieldError(this.form, "password", "Неверный логин или пароль");
        } else {
          setFormFeedback(
            this.form,
            error.message ?? "Произошла ошибка при авторизации"
          );
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
