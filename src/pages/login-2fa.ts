import { api, ApiError } from "../api";
import { navigate, resetAuthState } from "../router";
import {
  clearFormErrors,
  setFormFeedback,
  setFormFieldError,
  setFormLoading,
} from "../utils/auth-form";
import {
  fillTwoFactorDigit,
  handleTwoFactorKeyDown,
  twoFactorCode,
} from "../utils/two-factor-input";

/**
 * Страница ввода TOTP после signin/OAuth (кука `bnn_2fa`, маршрут `/login/2fa`).
 */
export class LoginTwoFactorPage {
  private form: HTMLFormElement | null = null;
  private onSubmit: ((event: SubmitEvent) => void) | null = null;
  private onKeyDown: ((event: KeyboardEvent) => void) | null = null;
  private onInput: ((event: Event) => void) | null = null;

  async render(): Promise<string> {
    const template = Handlebars.templates["login-2fa"];
    return template({ title: "Код из приложения" });
  }

  mount(root: ParentNode): void {
    const form = root.querySelector<HTMLFormElement>("[data-form-type='login-2fa']");
    if (!form) {
      return;
    }

    this.form = form;

    const clearCodeError = (): void => {
      setFormFieldError(form, "code", "");
    };

    this.onKeyDown = (event: KeyboardEvent) => {
      handleTwoFactorKeyDown(event, clearCodeError);
    };

    this.onInput = (event: Event) => {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.matches("[data-2fa-digit]")) {
        fillTwoFactorDigit(input);
        clearCodeError();
      }
    };

    this.onSubmit = (event: SubmitEvent) => {
      void this.handleSubmit(event);
    };

    form.addEventListener("keydown", this.onKeyDown);
    form.addEventListener("input", this.onInput);
    form.addEventListener("submit", this.onSubmit);

    form.querySelector<HTMLInputElement>("[data-2fa-digit]")?.focus();
  }

  destroy(): void {
    const form = this.form;
    if (!form || !this.onSubmit || !this.onKeyDown || !this.onInput) {
      return;
    }
    form.removeEventListener("submit", this.onSubmit);
    form.removeEventListener("keydown", this.onKeyDown);
    form.removeEventListener("input", this.onInput);
    this.form = null;
    this.onSubmit = null;
    this.onKeyDown = null;
    this.onInput = null;
  }

  private async handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = this.form;
    if (!form) {
      return;
    }

    clearFormErrors(form);

    const code = twoFactorCode(form);
    if (!/^\d{6}$/.test(code)) {
      setFormFieldError(form, "code", "Введите 6 цифр из приложения");
      return;
    }

    setFormLoading(form, true);

    try {
      await api.verifyTwoFactor(code);
      resetAuthState();
      await navigate("/notes");
    } catch (error) {
      if (!this.form) {
        return;
      }

      if (error instanceof ApiError) {
        if (error.status === 403) {
          setFormFieldError(this.form, "code", "Неверный код");
        } else if (error.status === 401) {
          setFormFeedback(this.form, error.message);
        } else {
          setFormFeedback(this.form, error.message ?? "Не удалось подтвердить код");
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
