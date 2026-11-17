import { getNewPasswordError, getRepeatPasswordError } from "../../components/forms/auth-form";
import { handlePasswordToggleClick } from "../../components/forms/password-toggle";
import * as profileActions from "../../flux/profile/profile-actions";
import { profileStore } from "../../flux/profile/profile-store";
import { clearPasswordForm, setProfileError } from "./form-view";

/**
 * Подключает форму смены пароля.
 *
 * @param dialog Диалог профиля.
 * @returns Перерисовка ошибок по store и снятие обработчиков.
 */
export function mountPasswordForm(dialog: HTMLElement) {
  const form = dialog.querySelector<HTMLFormElement>("[data-profile-form='password']");
  const events = new AbortController();
  let active = false;
  let context = -1;
  let shownError = 0;
  const value = (name: string) =>
    (form?.elements.namedItem(name) as HTMLInputElement | null)?.value ?? "";
  /**
   * Проверяет текущий, новый и повтор пароля и показывает ошибки у полей.
   *
   * @returns `true`, если форму можно отправить.
   */
  function validate(): boolean {
    if (!form) return false;
    const messages = {
      currentPassword: value("currentPassword") ? "" : "Введите текущий пароль",
      newPassword: getNewPasswordError(value("newPassword"), value("currentPassword")),
      repeatPassword: getRepeatPasswordError(value("repeatPassword"), value("newPassword")),
    };
    for (const [name, message] of Object.entries(messages)) setProfileError(form, name, message);
    return Object.values(messages).every((message) => message === "");
  }
  form?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      if (validate())
        void profileActions.changePassword(value("currentPassword"), value("newPassword"));
    },
    { signal: events.signal }
  );
  form?.addEventListener(
    "click",
    (event) => {
      handlePasswordToggleClick(event);
    },
    { signal: events.signal }
  );
  form?.addEventListener(
    "input",
    (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !form) return;
      setProfileError(form, input.name, "");
      if (value("newPassword"))
        setProfileError(
          form,
          "newPassword",
          getNewPasswordError(value("newPassword"), value("currentPassword"))
        );
      if (value("repeatPassword"))
        setProfileError(
          form,
          "repeatPassword",
          getRepeatPasswordError(value("repeatPassword"), value("newPassword"))
        );
    },
    { signal: events.signal }
  );
  return {
    /**
     * Блокирует отправку на время запроса и показывает ошибку неверного пароля.
     */
    render(): void {
      if (!form) return;
      const state = profileStore.getState();
      const visible = state.open && state.view === "password";
      if (active !== visible || (visible && context !== state.context)) clearPasswordForm(form);
      context = state.context;
      active = visible;
      const operation = state.operations.password;
      const submit = form.querySelector<HTMLButtonElement>("[type='submit']");
      if (submit) submit.disabled = operation.status === "pending";
      if (
        visible &&
        operation.context === state.context &&
        operation.error &&
        shownError !== operation.requestId
      ) {
        shownError = operation.requestId;
        if (operation.error.status === 403)
          setProfileError(form, "currentPassword", "Неверный пароль");
      }
    },
    /** Снимает обработчики и очищает поля пароля. */
    destroy(): void {
      events.abort();
      if (form) clearPasswordForm(form);
    },
  };
}
