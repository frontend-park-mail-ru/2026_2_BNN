import { api, ApiError } from "../api";
import { navigate, resetAuthState } from "../router";
import type { User } from "../store/app-store";
import { getPasswordError } from "../utils/auth-form";

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AVATAR_LIMIT = 5 * 1024 * 1024;

type ProfileView = "loading" | "menu" | "password";

export interface ProfileOptions {
  notesCount: () => number;
  onLogout: () => void;
}

function formatJoined(iso: string): string {
  const date = new Date(iso);
  return `В Brand New Notes с ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function passwordForm(dialog: HTMLElement): HTMLFormElement | null {
  const form = dialog.querySelector("[data-profile-form='password']");
  return form instanceof HTMLFormElement ? form : null;
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

function clearPasswordForm(form: HTMLFormElement): void {
  form.reset();
  form.querySelectorAll(".profile-form__field").forEach((field) => {
    field.classList.remove("profile-form__field_error");
  });
  form.querySelectorAll(".profile-form__error").forEach((error) => {
    error.textContent = "";
  });
}

function showProfileView(dialog: HTMLElement, view: ProfileView): void {
  dialog.querySelectorAll<HTMLElement>("[data-profile-view]").forEach((node) => {
    node.hidden = node.dataset.profileView !== view;
  });

  const identity = dialog.querySelector<HTMLElement>("[data-profile-identity]");
  if (identity) {
    identity.hidden = view === "loading";
  }
}

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
    dialog.hidden = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dialog.classList.add("modal_open");
      });
    });
  }

  function closeProfile(): void {
    dialog.classList.remove("modal_open");
    const form = passwordForm(dialog);
    if (form) {
      clearPasswordForm(form);
    }
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      if (!dialog.classList.contains("modal_open")) {
        dialog.hidden = true;
      }
    }, 200);
  }

  async function openProfile(): Promise<void> {
    showDialog();
    showProfileView(dialog, "loading");

    try {
      const profile = await api.getProfile();
      fillProfile(page, profile, options.notesCount());
      showProfileView(dialog, "menu");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        resetAuthState("unauthenticated");
        await navigate("/login");
        return;
      }
      closeProfile();
      showToast(error instanceof ApiError ? error.message : "Не удалось открыть профиль");
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

    if (!dialog.contains(target) && target !== dialog) {
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
      }
      showProfileView(dialog, "menu");
      return;
    }

    if (target.closest("[data-profile-password]")) {
      showProfileView(dialog, "password");
      return;
    }

    if (target.closest("[data-profile-logout]")) {
      closeProfile();
      options.onLogout();
      return;
    }

    if (target.closest("[data-toast-close]")) {
      toast.hidden = true;
      window.clearTimeout(toastTimer);
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && !dialog.hidden) {
      closeProfile();
    }
  }

  function onInput(event: Event): void {
    const input = event.target;
    if (
      !(input instanceof HTMLInputElement) ||
      !input.form?.matches("[data-profile-form='password']")
    ) {
      return;
    }
    if (input.value === "") {
      setProfileError(input.form, input.name, "");
    }
  }

  async function onSubmit(event: SubmitEvent): Promise<void> {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.profileForm !== "password") {
      return;
    }
    event.preventDefault();

    const currentPassword = (form.elements.namedItem("currentPassword") as HTMLInputElement).value;
    const newPassword = (form.elements.namedItem("newPassword") as HTMLInputElement).value;
    const repeatPassword = (form.elements.namedItem("repeatPassword") as HTMLInputElement).value;

    const currentMessage = currentPassword === "" ? "Введите текущий пароль" : "";
    const nextMessage = getPasswordError(newPassword);
    const repeatMessage =
      repeatPassword === ""
        ? "Повторите пароль"
        : newPassword !== repeatPassword
          ? "Пароли не совпадают"
          : "";

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
      showToast(error instanceof ApiError ? error.message : "Не удалось сохранить пароль");
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
      showToast("Нужен файл JPEG, PNG или WebP");
      return;
    }
    if (file.size > AVATAR_LIMIT) {
      showToast("Файл больше 5 МБ");
      return;
    }

    void api.updateAvatar(file).then(
      (profile) => {
        fillProfile(page, profile, options.notesCount());
        showToast("Аватар обновлён");
      },
      (error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          resetAuthState("unauthenticated");
          void navigate("/login");
          return;
        }
        showToast(error instanceof ApiError ? error.message : "Не удалось обновить аватар");
      }
    );
  }

  page.addEventListener("click", onClick);
  page.addEventListener("keydown", onKeyDown);
  page.addEventListener("input", onInput);
  page.addEventListener("submit", onSubmit);
  page.addEventListener("change", onChange);

  return () => {
    window.clearTimeout(toastTimer);
    window.clearTimeout(closeTimer);
    page.removeEventListener("click", onClick);
    page.removeEventListener("keydown", onKeyDown);
    page.removeEventListener("input", onInput);
    page.removeEventListener("submit", onSubmit);
    page.removeEventListener("change", onChange);
  };
}
