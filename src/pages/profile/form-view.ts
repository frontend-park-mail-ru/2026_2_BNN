import { resetPasswordToggles } from "@/components/forms/password-toggle";

/**
 * Показывает или снимает ошибку поля формы профиля.
 *
 * @param form Форма смены пароля.
 * @param name Имя поля (`currentPassword`, `newPassword`, `repeatPassword`).
 * @param message Текст ошибки; пустая строка скрывает ошибку.
 */
export function setProfileError(form: HTMLFormElement, name: string, message: string): void {
  const error = form.querySelector(`[data-error-for="${name}"]`);
  if (!error) {
    return;
  }

  error.textContent = message;
  error
    .closest(".profile-form__field")
    ?.classList.toggle("profile-form__field_error", message !== "");
}

/**
 * Сбрасывает форму пароля, ошибки и иконки «показать пароль».
 *
 * @param form Форма смены пароля.
 */
export function clearPasswordForm(form: HTMLFormElement): void {
  form.reset();
  form.querySelectorAll(".profile-form__field").forEach((field) => {
    field.classList.remove("profile-form__field_error");
  });
  form.querySelectorAll(".profile-form__error").forEach((error) => {
    error.textContent = "";
  });
  form.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
    input.type = "password";
  });
  resetPasswordToggles(form);
}

/**
 * Сбрасывает введённые цифры и сообщение «Неверный код».
 *
 * @param form Форма включения или отключения двухфакторной аутентификации.
 */
export function clearTwoFactorForm(form: HTMLFormElement): void {
  form.reset();
  setProfileError(form, "code", "");
}
