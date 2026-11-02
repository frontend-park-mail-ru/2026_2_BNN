import { api, ApiError } from "../api";
import { navigate, resetAuthState } from "../router";
import type { User } from "../store/app-store";
import { getNewPasswordError, getRepeatPasswordError } from "../utils/auth-form";
import { formatJoined } from "../utils/date";
import { handlePasswordToggleClick, resetPasswordToggles } from "../utils/password-toggle";

const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AVATAR_LIMIT = 5 * 1024 * 1024;
const AVATAR_SPINNER_MIN = 600;

const PROFILE_OPEN_FAILED = "Не удалось открыть профиль, попробуйте позже";
const PASSWORD_SAVE_FAILED = "Не удалось сохранить пароль, попробуйте позже";
const AVATAR_UPDATE_FAILED = "Не удалось обновить аватар, попробуйте позже";

type ProfileView = "loading" | "menu" | "password" | "twoFactor";

/** Колбэки и данные, которые страница заметок передаёт в модалку профиля. */
export interface ProfileOptions {
  /** Текущее число заметок для блока статистики. */
  notesCount: () => number;
  /** Открывает диалог выхода (разметка на странице заметок). */
  onLogout: () => void;
}

/**
 * Находит форму смены пароля внутри модалки профиля.
 *
 * @param dialog Корневой элемент `[data-profile-dialog]`.
 * @returns Форма или `null`, если её нет в DOM.
 */
function passwordForm(dialog: HTMLElement): HTMLFormElement | null {
  const form = dialog.querySelector("[data-profile-form='password']");
  return form instanceof HTMLFormElement ? form : null;
}

/**
 * Показывает или снимает ошибку поля формы профиля.
 *
 * @param form Форма смены пароля.
 * @param name Имя поля (`currentPassword`, `newPassword`, `repeatPassword`).
 * @param message Текст ошибки; пустая строка скрывает ошибку.
 */
function twoFactorCode(form: HTMLFormElement): string {
  return [...form.querySelectorAll<HTMLInputElement>("[data-2fa-digit]")]
    .map((input) => input.value)
    .join("");
}

function digitInputs(input: HTMLInputElement): HTMLInputElement[] {
  const code = input.closest(".profile-form__code");
  if (!code) {
    return [];
  }
  return [...code.querySelectorAll<HTMLInputElement>("[data-2fa-digit]")];
}

function fillDigit(input: HTMLInputElement): void {
  const digits = input.value.replace(/\D/g, "");
  const inputs = digitInputs(input);
  const index = inputs.indexOf(input);

  if (digits.length <= 1) {
    input.value = digits;
    if (digits.length === 1) {
      inputs[index + 1]?.focus();
    }
    return;
  }

  for (let offset = 0; offset < digits.length && index + offset < inputs.length; offset++) {
    inputs[index + offset].value = digits[offset];
  }
  const next = Math.min(index + digits.length, inputs.length - 1);
  inputs[next]?.focus();
}

function setProfileError(form: HTMLFormElement, name: string, message: string): void {
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
function clearPasswordForm(form: HTMLFormElement): void {
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
 * Переключает видимые секции модалки: загрузка, меню или смена пароля.
 *
 * @param dialog Корневой элемент `[data-profile-dialog]`.
 * @param view Целевое представление.
 */
function showProfileView(dialog: HTMLElement, view: ProfileView): void {
  dialog.querySelectorAll<HTMLElement>("[data-profile-view]").forEach((node) => {
    node.hidden = node.dataset.profileView !== view;
  });

  const identity = dialog.querySelector<HTMLElement>("[data-profile-identity]");
  if (identity) {
    identity.hidden = view === "loading";
  }
}

/**
 * Ждёт не меньше `min` мс с момента `started` (для минимальной длительности спиннера).
 *
 * @param started Время начала операции (`Date.now()`).
 * @param min Минимальная длительность в миллисекундах.
 */
function waitAtLeast(started: number, min: number): Promise<void> {
  const rest = min - (Date.now() - started);
  if (rest <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    window.setTimeout(resolve, rest);
  });
}

/**
 * Обновляет логин, дату регистрации, счётчик заметок и аватар на странице и в модалке.
 *
 * @param page Корень `.notes`.
 * @param profile Профиль пользователя.
 * @param notesCount Число заметок для статистики.
 */
function fillProfile(page: HTMLElement, profile: User, notesCount: number): void {
  page.querySelectorAll("[data-user-login]").forEach((node) => {
    node.textContent = profile.login;
  });

  const since = page.querySelector("[data-profile-since]");
  if (since) {
    since.textContent = formatJoined(profile.created_at);
  }

  const notes = page.querySelector("[data-stat='notes']");
  if (notes) {
    notes.textContent = String(notesCount);
  }

  const src = api.avatarUrl(profile.avatar);
  page
    .querySelectorAll<HTMLImageElement>(".profile__avatar-image, .user-menu__image")
    .forEach((image) => {
      image.src = src;
    });
}

/**
 * Подключает модалку профиля, тост и обработчики на странице заметок.
 *
 * @param page Корень `.notes` с разметкой профиля и тоста.
 * @param options Колбэки страницы заметок.
 * @returns Функция отписки от всех обработчиков.
 */
export function mountProfile(page: HTMLElement, options: ProfileOptions): () => void {
  const dialogElement = page.querySelector<HTMLElement>("[data-profile-dialog]");
  const toastElement = page.querySelector<HTMLElement>("[data-toast]");
  const toastTextElement = page.querySelector("[data-toast-text]");
  if (!dialogElement || !toastElement || !toastTextElement) {
    return () => undefined;
  }

  const dialog = dialogElement;
  const toast = toastElement;
  const toastText = toastTextElement;

  let toastTimer: number | undefined;
  let closeTimer: number | undefined;
  let profileRequest = 0;
  let openFrame = 0;
  let qrUrl = "";

  function clearQr(): void {
    if (qrUrl) {
      URL.revokeObjectURL(qrUrl);
      qrUrl = "";
    }
    dialog.querySelector<HTMLImageElement>("[data-2fa-qr]")?.removeAttribute("src");
  }

  async function openTwoFactror(): Promise<void> {
    showProfileView(dialog, "twoFactor");
    clearQr();
    try {
      qrUrl = await api.generateTwoFactorQr();
      const image = dialog.querySelector<HTMLImageElement>("[data-2fa-qr]");
      if (image) {
        image.src = qrUrl;
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        resetAuthState("unauthenticated");
        await navigate("/login");
        return;
      }
      showToast("Не удалось получить QR-код", false);
      showProfileView(dialog, "menu");
    }
  }

  function showToast(message: string, ok = true): void {
    toastText.textContent = message;
    toast.classList.toggle("toast_error", !ok);
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 4000);
  }

  function showDialog(): void {
    window.clearTimeout(closeTimer);
    window.cancelAnimationFrame(openFrame);
    dialog.hidden = false;
    openFrame = window.requestAnimationFrame(() => {
      openFrame = window.requestAnimationFrame(() => {
        dialog.classList.add("modal_open");
      });
    });
  }

  function closeProfile(): void {
    profileRequest += 1;
    window.cancelAnimationFrame(openFrame);
    const wasOpen = dialog.classList.contains("modal_open");
    dialog.classList.remove("modal_open");
    const form = passwordForm(dialog);
    if (form) {
      clearPasswordForm(form);
      clearQr();
    }
    window.clearTimeout(closeTimer);
    if (!wasOpen) {
      dialog.hidden = true;
      return;
    }
    closeTimer = window.setTimeout(() => {
      if (!dialog.classList.contains("modal_open")) {
        dialog.hidden = true;
      }
    }, 200);
  }

  async function openProfile(): Promise<void> {
    const request = ++profileRequest;
    showDialog();
    showProfileView(dialog, "loading");

    try {
      const profile = await api.getProfile();
      if (request !== profileRequest) {
        return;
      }
      fillProfile(page, profile, options.notesCount());
      showProfileView(dialog, "menu");
    } catch (error) {
      if (request !== profileRequest) {
        return;
      }
      if (error instanceof ApiError && error.status === 401) {
        resetAuthState("unauthenticated");
        await navigate("/login");
        return;
      }
      showToast(PROFILE_OPEN_FAILED, false);
      closeProfile();
    }
  }

  function onClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest("[data-profile-open]")) {
      void openProfile();
      return;
    }

    if (target.closest("[data-toast-close]")) {
      toast.hidden = true;
      window.clearTimeout(toastTimer);
      return;
    }

    if (!dialog.contains(target) && target !== dialog) {
      return;
    }

    if (handlePasswordToggleClick(event)) {
      return;
    }

    if (target.closest("[data-profile-close]") || target === dialog) {
      closeProfile();
      return;
    }

    if (target.closest("[data-profile-cancel]")) {
      const form = passwordForm(dialog);
      if (form) {
        clearPasswordForm(form);
        clearQr();
        dialog.querySelector<HTMLFormElement>("[data-profile-form='twoFactor']")?.reset();
      }
      showProfileView(dialog, "menu");
      return;
    }

    if (target.closest("[data-profile-password]")) {
      showProfileView(dialog, "password");
      return;
    }

    if (target.closest("[data-profile-two-factor]")) {
      void openTwoFactror();
      return;
    }

    if (target.closest("[data-profile-logout]")) {
      closeProfile();
      options.onLogout();
      return;
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && !dialog.hidden) {
      closeProfile();
      return;
    }

    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches("[data-2fa-digit]")) {
      return;
    }

    const inputs = digitInputs(input);
    const index = inputs.indexOf(input);

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      input.value = event.key;
      inputs[index + 1]?.focus();
      input.form && setProfileError(input.form, "code", "");
      return;
    }

    if (event.key === "Backspace" && input.value === "") {
      const previous = inputs[index - 1];
      if (previous) {
        previous.value = "";
        previous.focus();
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      inputs[index - 1]?.focus();
    }
    if (event.key === "ArrowRight") {
      inputs[index + 1]?.focus();
    }
  }

  function onInput(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.matches("[data-2fa-digit]")) {
      fillDigit(input);
      const form = input.form;
      if (form) {
        setProfileError(form, "code", "");
      }
      return;
    }
    if (
      !(input instanceof HTMLInputElement) ||
      !input.form?.matches("[data-profile-form='password']")
    ) {
      return;
    }

    const form = input.form;
    const currentPassword = (form.elements.namedItem("currentPassword") as HTMLInputElement).value;
    const newPassword = (form.elements.namedItem("newPassword") as HTMLInputElement).value;
    const repeatPassword = (form.elements.namedItem("repeatPassword") as HTMLInputElement).value;

    if (input.value === "") {
      setProfileError(form, input.name, "");
    } else if (input.name === "currentPassword") {
      setProfileError(form, "currentPassword", "");
    } else if (input.name === "newPassword") {
      setProfileError(form, "newPassword", getNewPasswordError(newPassword, currentPassword));
    } else if (input.name === "repeatPassword") {
      setProfileError(form, "repeatPassword", getRepeatPasswordError(repeatPassword, newPassword));
    }

    if (input.name !== "newPassword" && newPassword !== "") {
      setProfileError(form, "newPassword", getNewPasswordError(newPassword, currentPassword));
    }
    if (input.name !== "repeatPassword" && repeatPassword !== "") {
      setProfileError(form, "repeatPassword", getRepeatPasswordError(repeatPassword, newPassword));
    }
  }

  async function onSubmit(event: SubmitEvent): Promise<void> {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }
    event.preventDefault();

    if (form.dataset.profileForm === "twoFactor") {
      const code = twoFactorCode(form);
      if (!/^\d{6}$/.test(code)) {
        setProfileError(form, "code", "Введите 6 цифр из приложения");
        return;
      }
      try {
        await api.enableTwoFactor(code);
        clearQr();
        form.reset();
        showProfileView(dialog, "menu");
        showToast("Двухфакторная аутентификация включена");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setProfileError(form, "code", "Неверный код");
          return;
        }
        showToast("Не удалось включить 2FA, попробуйте позже", false);
      }
      return;
    }

    if (form.dataset.profileForm !== "password") {
      return;
    }

    const currentPassword = (form.elements.namedItem("currentPassword") as HTMLInputElement).value;
    const newPassword = (form.elements.namedItem("newPassword") as HTMLInputElement).value;
    const repeatPassword = (form.elements.namedItem("repeatPassword") as HTMLInputElement).value;

    const currentMessage = currentPassword === "" ? "Введите текущий пароль" : "";
    const nextMessage = getNewPasswordError(newPassword, currentPassword);
    const repeatMessage = getRepeatPasswordError(repeatPassword, newPassword);

    setProfileError(form, "currentPassword", currentMessage);
    setProfileError(form, "newPassword", nextMessage);
    setProfileError(form, "repeatPassword", repeatMessage);

    if (currentMessage || nextMessage || repeatMessage) {
      return;
    }

    const submit = form.querySelector<HTMLButtonElement>("[type='submit']");
    if (submit) {
      submit.disabled = true;
    }

    try {
      await api.changePassword(currentPassword, newPassword);
      clearPasswordForm(form);
      showProfileView(dialog, "menu");
      showToast("Пароль изменён");
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setProfileError(form, "currentPassword", "Неверный пароль");
        return;
      }
      if (error instanceof ApiError && error.status === 401) {
        resetAuthState("unauthenticated");
        await navigate("/login");
        return;
      }
      showToast(PASSWORD_SAVE_FAILED, false);
    } finally {
      if (submit) {
        submit.disabled = false;
      }
    }
  }

  function onChange(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches("[data-avatar-input]")) {
      return;
    }

    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }
    if (!AVATAR_TYPES.includes(file.type)) {
      showToast("Нужен файл JPEG, PNG или WebP", false);
      return;
    }
    if (file.size > AVATAR_LIMIT) {
      showToast("Файл больше 5 МБ", false);
      return;
    }

    const avatar = input.closest(".profile__avatar");
    const started = Date.now();
    avatar?.classList.add("login-form__submit_loading");
    input.disabled = true;

    void api
      .updateAvatar(file)
      .then(
        (profile) => {
          avatar?.classList.remove("login-form__submit_loading");
          fillProfile(page, profile, options.notesCount());
          showToast("Аватар обновлён");
        },
        async (error: unknown) => {
          if (error instanceof ApiError && error.status === 401) {
            resetAuthState("unauthenticated");
            await navigate("/login");
            return;
          }
          await waitAtLeast(started, AVATAR_SPINNER_MIN);
          showToast(AVATAR_UPDATE_FAILED, false);
        }
      )
      .finally(() => {
        avatar?.classList.remove("login-form__submit_loading");
        input.disabled = false;
      });
  }

  page.addEventListener("click", onClick);
  page.addEventListener("keydown", onKeyDown);
  page.addEventListener("input", onInput);
  page.addEventListener("submit", onSubmit);
  page.addEventListener("change", onChange);

  return () => {
    window.clearTimeout(toastTimer);
    window.clearTimeout(closeTimer);
    clearQr();
    page.removeEventListener("click", onClick);
    page.removeEventListener("keydown", onKeyDown);
    page.removeEventListener("input", onInput);
    page.removeEventListener("submit", onSubmit);
    page.removeEventListener("change", onChange);
  };
}
