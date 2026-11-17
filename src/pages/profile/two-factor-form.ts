import {
  fillTwoFactorDigit,
  handleTwoFactorKeyDown,
  twoFactorCode,
} from "../../components/forms/two-factor-input";
import * as profileActions from "../../flux/profile/profile-actions";
import { profileStore } from "../../flux/profile/profile-store";
import { clearTwoFactorForm, setProfileError } from "./form-view";

/**
 * Подключает формы включения и отключения двухфакторной аутентификации.
 *
 * @param dialog Диалог профиля.
 * @returns Перерисовка по store и снятие обработчиков.
 */
export function mountTwoFactorForm(dialog: HTMLElement) {
  const forms = [
    ...dialog.querySelectorAll<HTMLFormElement>(
      "[data-profile-form='twoFactor'], [data-profile-form='twoFactorDisable']"
    ),
  ];
  const events = new AbortController();
  let previousView = "";
  let previousContext = -1;
  const shownErrors = new Map<HTMLFormElement, number>();
  for (const form of forms) {
    form.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        const code = twoFactorCode(form);
        if (!/^\d{6}$/.test(code)) {
          setProfileError(form, "code", "Введите 6 цифр из приложения");
          return;
        }
        if (form.dataset.profileForm === "twoFactor") void profileActions.enableTwoFactor(code);
        else void profileActions.disableTwoFactor(code);
      },
      { signal: events.signal }
    );
    form.addEventListener(
      "input",
      (event) => {
        if (event.target instanceof HTMLInputElement && event.target.matches("[data-2fa-digit]")) {
          fillTwoFactorDigit(event.target);
          setProfileError(form, "code", "");
        }
      },
      { signal: events.signal }
    );
    form.addEventListener(
      "keydown",
      (event) => {
        handleTwoFactorKeyDown(event, () => setProfileError(form, "code", ""));
      },
      { signal: events.signal }
    );
  }
  return {
    /**
     * Показывает QR, блокирует отправку на время запроса и выводит ошибку кода.
     */
    render(): void {
      const state = profileStore.getState();
      const view = state.open ? state.view : "";
      const changed = previousView !== view || previousContext !== state.context;
      previousView = view;
      previousContext = state.context;
      const image = dialog.querySelector<HTMLImageElement>("[data-2fa-qr]");
      if (image) {
        if (state.qrUrl && image.getAttribute("src") !== state.qrUrl) image.src = state.qrUrl;
        else if (!state.qrUrl) image.removeAttribute("src");
      }
      for (const form of forms) {
        if (changed) clearTwoFactorForm(form);
        const enabling = form.dataset.profileForm === "twoFactor";
        const operation = state.operations[enabling ? "enable-two-factor" : "disable-two-factor"];
        const submit = form.querySelector<HTMLButtonElement>("[type='submit']");
        if (submit)
          submit.disabled =
            operation.status === "pending" ||
            (enabling && (!state.qrUrl || state.operations.qr.status === "pending"));
        if (
          view === form.dataset.profileForm &&
          operation.context === state.context &&
          operation.error &&
          shownErrors.get(form) !== operation.requestId
        ) {
          shownErrors.set(form, operation.requestId);
          if (operation.error.status === 403) setProfileError(form, "code", "Неверный код");
        }
        if (changed && view === form.dataset.profileForm)
          form.querySelector<HTMLElement>("[data-2fa-digit]")?.focus();
      }
    },
    /** Снимает обработчики, очищает код и адрес QR. */
    destroy(): void {
      events.abort();
      forms.forEach(clearTwoFactorForm);
      dialog.querySelector("[data-2fa-qr]")?.removeAttribute("src");
    },
  };
}
