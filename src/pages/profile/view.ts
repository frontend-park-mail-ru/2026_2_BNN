import { api } from "@/api";
import { themeAsset } from "@/components/theme/theme";
import type { User } from "@/types/user";
import type { ProfileView } from "@/flux/profile/profile-action-types";
import { formatJoined } from "@/pages/profile/date";

/**
 * Переключает видимые секции модалки: загрузка, меню или смена пароля.
 *
 * @param dialog Корневой элемент `[data-profile-dialog]`.
 * @param view Целевое представление.
 */
export function showProfileView(dialog: HTMLElement, view: ProfileView): void {
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
export function syncProfileMenu(dialog: HTMLElement, profile: User): void {
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
 * Обновляет логин, дату регистрации и аватар на странице и в модалке.
 *
 * @param page Корень `.notes`.
 * @param dialog Корневой элемент `[data-profile-dialog]`.
 * @param profile Профиль пользователя.
 */
export function fillProfile(page: HTMLElement, dialog: HTMLElement, profile: User): void {
  page.querySelectorAll("[data-user-login]").forEach((node) => {
    node.textContent = profile.login;
  });

  const since = page.querySelector("[data-profile-since]");
  if (since) {
    since.textContent = formatJoined(profile.created_at);
  }

  const src = api.avatarUrl(profile.avatar) || themeAsset("avatar");
  page
    .querySelectorAll<HTMLImageElement>(".profile__avatar-image, .user-menu__image")
    .forEach((image) => {
      if (image.getAttribute("src") !== src) image.src = src;
    });

  syncProfileMenu(dialog, profile);
}
