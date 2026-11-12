import { api, ApiError } from "../api";
import { navigate, resetAuthState } from "../router";
import type { User } from "../store/app-store";
import { AvatarCrop } from "../utils/avatar-crop";
import { getNewPasswordError, getRepeatPasswordError } from "../utils/auth-form";
import { formatJoined } from "../utils/date";
import { handlePasswordToggleClick, resetPasswordToggles } from "../utils/password-toggle";
import {
  fillTwoFactorDigit,
  handleTwoFactorKeyDown,
  twoFactorCode,
} from "../utils/two-factor-input";

const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AVATAR_LIMIT = 5 * 1024 * 1024;

const PROFILE_OPEN_FAILED = "Не удалось открыть профиль, попробуйте позже";
const PASSWORD_SAVE_FAILED = "Не удалось сохранить пароль, попробуйте позже";
const AVATAR_UPDATE_FAILED = "Не удалось обновить аватар, попробуйте позже";

type ProfileView = "loading" | "menu" | "password" | "twoFactor" | "twoFactorDisable" | "avatar";

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
 * Сбрасывает введённые цифры и сообщение «Неверный код».
 *
 * @param form Форма включения или отключения двухфакторной аутентификации.
 */
function clearTwoFactorForm(form: HTMLFormElement): void {
  form.reset();
  setProfileError(form, "code", "");
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
    identity.hidden = view === "loading" || view === "avatar";
  }
}

/**
 * Показывает кнопки смены пароля и защиты входа по данным профиля.
 *
 * @param dialog Корневой элемент `[data-profile-dialog]`.
 * @param profile Профиль пользователя.
 */
function syncProfileMenu(dialog: HTMLElement, profile: User): void {
  const passwordButton = dialog.querySelector<HTMLElement>("[data-profile-password]");
  if (passwordButton) {
    passwordButton.hidden = profile.oauth_provider === "github";
  }

  const twoFactorButton = dialog.querySelector<HTMLElement>("[data-profile-two-factor]");
  if (twoFactorButton) {
    const enabled = profile.is_2fa_enabled;
    twoFactorButton.dataset.twoFactorAction = enabled ? "disable" : "enable";
  }
}

/**
 * Обновляет логин, дату регистрации, счётчик заметок и аватар на странице и в модалке.
 *
 * @param page Корень `.notes`.
 * @param dialog Корневой элемент `[data-profile-dialog]`.
 * @param profile Профиль пользователя.
 * @param notesCount Число заметок для статистики.
 */
function fillProfile(
  page: HTMLElement,
  dialog: HTMLElement,
  profile: User,
  notesCount: number
): void {
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

  syncProfileMenu(dialog, profile);
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
  let crop: AvatarCrop | null = null;
  let cropToken = 0;

  /**
   * Блокирует кнопки кропа на время загрузки аватара.
   *
   * @param saving Идёт ли отправка файла.
   */
  function setCropButtons(saving: boolean): void {
    const save = dialog.querySelector<HTMLButtonElement>("[data-avatar-save]");
    const cancel = dialog.querySelector<HTMLButtonElement>("[data-avatar-cancel]");
    if (save) {
      save.disabled = saving;
      save.textContent = saving ? "Сохраняем…" : "Сохранить";
    }
    if (cancel) {
      cancel.disabled = saving;
    }
  }

  /**
   * Сбрасывает кроп и освобождает объектный URL картинки.
   */
  function closeCrop(): void {
    cropToken += 1;
    crop?.destroy();
    crop = null;
    setCropButtons(false);
  }

  /**
   * Открывает кадрирование выбранного файла, не отправляя его на сервер.
   *
   * @param file JPEG, PNG или WebP из поля аватара.
   */
  async function startCrop(file: File): Promise<void> {
    const canvas = dialog.querySelector("canvas[data-avatar-crop]");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }
    closeCrop();
    const token = cropToken;
    const next = await AvatarCrop.open(canvas, file);
    if (token !== cropToken) {
      next?.destroy();
      return;
    }
    if (!next) {
      showToast("Не удалось открыть изображение", false);
      return;
    }
    crop = next;
    showProfileView(dialog, "avatar");
  }

  /**
   * Вырезает квадрат, проверяет размер и только потом вызывает `updateAvatar`.
   */
  async function saveCrop(): Promise<void> {
    const current = crop;
    if (!current) {
      return;
    }
    const token = cropToken;
    current.lock();
    setCropButtons(true);
    try {
      const file = await current.toFile();
      if (!file || token !== cropToken) {
        return;
      }
      if (file.size > AVATAR_LIMIT) {
        showToast("После обрезки файл больше 5 МБ", false);
        return;
      }
      const profile = await api.updateAvatar(file);
      fillProfile(page, dialog, profile, options.notesCount());
      showToast("Аватар обновлён");
      if (token === cropToken) {
        closeCrop();
        showProfileView(dialog, "menu");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        resetAuthState("unauthenticated");
        await navigate("/login");
        return;
      }
      const message =
        error instanceof ApiError && (error.status === 413 || error.status === 415)
          ? error.message
          : AVATAR_UPDATE_FAILED;
      showToast(message, false);
    } finally {
      if (token === cropToken) {
        current.unlock();
        setCropButtons(false);
      }
    }
  }

  /**
   * Освобождает объектный URL QR-кода и убирает картинку из диалога.
   */
  function clearQr(): void {
    if (qrUrl) {
      URL.revokeObjectURL(qrUrl);
      qrUrl = "";
    }
    dialog.querySelector<HTMLImageElement>("[data-2fa-qr]")?.removeAttribute("src");
  }

  /**
   * Очищает поля включения и отключения двухфакторной защиты.
   */
  function clearTwoFactorForms(): void {
    dialog
      .querySelectorAll<HTMLFormElement>(
        "[data-profile-form='twoFactor'], [data-profile-form='twoFactorDisable']"
      )
      .forEach(clearTwoFactorForm);
  }

  /**
   * Запрашивает новый QR и показывает экран включения 2FA.
   */
  async function openTwoFactor(): Promise<void> {
    clearTwoFactorForms();
    showProfileView(dialog, "twoFactor");
    clearQr();
    try {
      qrUrl = await api.generateTwoFactorQr();
      const image = dialog.querySelector<HTMLImageElement>("[data-2fa-qr]");
      if (image) {
        image.src = qrUrl;
      }
      dialog
        .querySelector<HTMLInputElement>("[data-profile-form='twoFactor'] [data-2fa-digit]")
        ?.focus();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        resetAuthState("unauthenticated");
        await navigate("/login");
        return;
      }
      if (error instanceof ApiError && error.status === 409) {
        try {
          const profile = await api.getProfile();
          fillProfile(page, dialog, profile, options.notesCount());
        } catch {
          /* профиль обновится при следующем открытии */
        }
        showToast("Двухфакторная аутентификация уже включена", false);
        showProfileView(dialog, "menu");
        return;
      }
      showToast("Не удалось получить QR-код", false);
      showProfileView(dialog, "menu");
    }
  }

  /**
   * Открывает ввод кода, которым отключают 2FA.
   */
  function openTwoFactorDisable(): void {
    clearTwoFactorForms();
    showProfileView(dialog, "twoFactorDisable");
    dialog
      .querySelector<HTMLInputElement>("[data-profile-form='twoFactorDisable'] [data-2fa-digit]")
      ?.focus();
  }

  /**
   * Показывает тост профиля и прячет его через 4 секунды.
   *
   * @param message Текст.
   * @param ok `false` красит тост как ошибку.
   */
  function showToast(message: string, ok = true): void {
    toastText.textContent = message;
    toast.classList.toggle("toast_error", !ok);
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 4000);
  }

  /**
   * Открывает модалку профиля с двухкадровой анимацией.
   */
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

  /**
   * Закрывает профиль, кроп и сбрасывает незавершённые формы.
   */
  function closeProfile(): void {
    closeCrop();
    profileRequest += 1;
    window.cancelAnimationFrame(openFrame);
    const wasOpen = dialog.classList.contains("modal_open");
    dialog.classList.remove("modal_open");

    const form = passwordForm(dialog);
    if (form) {
      clearPasswordForm(form);
    }
    clearTwoFactorForms();
    clearQr();

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

  /**
   * Открывает профиль и подгружает свежие данные пользователя.
   */
  async function openProfile(): Promise<void> {
    closeCrop();
    const request = ++profileRequest;
    showDialog();
    showProfileView(dialog, "loading");

    try {
      const profile = await api.getProfile();
      if (request !== profileRequest) {
        return;
      }
      fillProfile(page, dialog, profile, options.notesCount());
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

  /**
   * Клики по пунктам профиля, кнопкам кропа и закрытию модалки.
   *
   * @param event Клик внутри страницы.
   */
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

    if (target.closest("[data-avatar-cancel]")) {
      closeCrop();
      showProfileView(dialog, "menu");
      return;
    }

    if (target.closest("[data-avatar-save]")) {
      void saveCrop();
      return;
    }

    if (target.closest("[data-profile-cancel]")) {
      const form = passwordForm(dialog);
      if (form) {
        clearPasswordForm(form);
      }
      clearQr();
      clearTwoFactorForms();
      showProfileView(dialog, "menu");
      return;
    }

    if (target.closest("[data-profile-password]")) {
      showProfileView(dialog, "password");
      return;
    }

    const twoFactorButton = target.closest<HTMLElement>("[data-profile-two-factor]");
    if (twoFactorButton) {
      if (twoFactorButton.dataset.twoFactorAction === "disable") {
        openTwoFactorDisable();
      } else {
        void openTwoFactor();
      }
      return;
    }

    if (target.closest("[data-profile-logout]")) {
      closeProfile();
      options.onLogout();
      return;
    }
  }

  /**
   * Escape закрывает профиль, цифры 2FA переключают поля.
   *
   * @param event Клавиша на странице.
   */
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && !dialog.hidden) {
      closeProfile();
      return;
    }

    const input = event.target;
    if (input instanceof HTMLInputElement && input.form?.dataset.profileForm) {
      handleTwoFactorKeyDown(event, () => {
        if (input.form) {
          setProfileError(input.form, "code", "");
        }
      });
    }
  }

  /**
   * Снимает ошибку поля, когда пользователь снова печатает.
   *
   * @param event Ввод в форме профиля.
   */
  function onInput(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.matches("[data-2fa-digit]")) {
      fillTwoFactorDigit(input);
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

  /**
   * Отправляет смену пароля или код 2FA.
   *
   * @param event Сабмит формы внутри диалога.
   */
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
        const profile = await api.enableTwoFactor(code);
        clearQr();
        form.reset();
        fillProfile(page, dialog, profile, options.notesCount());
        showProfileView(dialog, "menu");
        showToast("Двухфакторная аутентификация включена");
      } catch (error) {
        if (error instanceof ApiError && error.status === 403) {
          setProfileError(form, "code", "Неверный код");
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          resetAuthState("unauthenticated");
          await navigate("/login");
          return;
        }
        showToast("Не удалось включить двухфакторную аутентификацию, попробуйте позже", false);
      }
      return;
    }

    if (form.dataset.profileForm === "twoFactorDisable") {
      const code = twoFactorCode(form);
      if (!/^\d{6}$/.test(code)) {
        setProfileError(form, "code", "Введите 6 цифр из приложения");
        return;
      }
      try {
        const profile = await api.disableTwoFactor(code);
        form.reset();
        fillProfile(page, dialog, profile, options.notesCount());
        showProfileView(dialog, "menu");
        showToast("Двухфакторная аутентификация отключена");
      } catch (error) {
        if (error instanceof ApiError && error.status === 403) {
          setProfileError(form, "code", "Неверный код");
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          resetAuthState("unauthenticated");
          await navigate("/login");
          return;
        }
        showToast("Не удалось отключить двухфакторную аутентификацию, попробуйте позже", false);
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
      if (error instanceof ApiError && error.status === 400) {
        showToast(error.message, false);
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

  /**
   * Проверяет выбранный аватар и открывает кроп, не загружая исходный файл.
   *
   * @param event Смена `[data-avatar-input]`.
   */
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

    void startCrop(file);
  }

  page.addEventListener("click", onClick);
  page.addEventListener("keydown", onKeyDown);
  page.addEventListener("input", onInput);
  page.addEventListener("submit", onSubmit);
  page.addEventListener("change", onChange);

  return () => {
    window.clearTimeout(toastTimer);
    window.clearTimeout(closeTimer);
    closeCrop();
    clearQr();
    page.removeEventListener("click", onClick);
    page.removeEventListener("keydown", onKeyDown);
    page.removeEventListener("input", onInput);
    page.removeEventListener("submit", onSubmit);
    page.removeEventListener("change", onChange);
  };
}
