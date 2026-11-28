import { authStore } from "@/flux/auth/auth-store";
import * as profileActions from "@/flux/profile/profile-actions";
import { profileStore } from "@/flux/profile/profile-store";
import { mountAvatarForm } from "@/pages/profile/avatar-form";
import { mountPasswordForm } from "@/pages/profile/password-form";
import { mountTwoFactorForm } from "@/pages/profile/two-factor-form";
import { fillProfile, showProfileView } from "@/pages/profile/view";
import { api } from "@/api";

/** Данные страницы, которые диалогу профиля сам store не отдаёт. */
export interface ProfileOptions {
  onLogout: () => void;
}

/** Собирает формы профиля. Пользователь — в AuthStore, операции — в ProfileStore. */
export function mountProfile(page: HTMLElement, options: ProfileOptions): () => void {
  const element = page.querySelector<HTMLElement>("[data-profile-dialog]");
  if (!element) return () => {};
  const dialog = element;
  const events = new AbortController();
  const password = mountPasswordForm(dialog);
  const twoFactor = mountTwoFactorForm(dialog);
  const avatar = mountAvatarForm(dialog);
  let disposed = false;
  let queued = false;
  let opened = false;
  let openFrame = 0;
  let closeTimer: number | undefined;
  let previousUser: ReturnType<typeof authStore.getState>["user"] | undefined;

  const onlineconfButton = dialog.querySelector<HTMLButtonElement>("[data-profile-onlineconf]");
  let onlineconfUserId: string | null = null;
  let onlineconfRequest: AbortController | undefined;

  function syncOnlineconfAccess(userId: string | null): void {
    if (!onlineconfButton || onlineconfUserId === userId) return;

    onlineconfRequest?.abort();
    onlineconfRequest = undefined;
    onlineconfUserId = userId;
    onlineconfButton.hidden = true;

    if (!userId) return;

    const request = new AbortController();
    onlineconfRequest = request;

    void api
      .request<{ id: string; login: string }>("/api/onlineconf/admin/session", {
        signal: request.signal,
        cache: "no-store",
      })
      .then((session) => {
        const auth = authStore.getState();
        if (
          onlineconfRequest === request &&
          !request.signal.aborted &&
          profileStore.getState().open &&
          auth.status === "authenticated" &&
          auth.user?.id === userId &&
          session?.id === userId
        ) {
          onlineconfButton.hidden = false;
        }
      })
      .catch(() => {
        // Кнопка остаётся скрытой, если доступ не подтверждён.
      });
  }

  /** Обновляет данные пользователя и открытую форму диалога. */
  function render(): void {
    if (disposed) return;
    const state = profileStore.getState();
    const auth = authStore.getState();
    syncOnlineconfAccess(
      state.open && auth.status === "authenticated" ? (auth.user?.id ?? null) : null
    );
    if (auth.user && auth.user !== previousUser) {
      fillProfile(page, dialog, auth.user);
      previousUser = auth.user;
    }
    if (state.open !== opened) {
      opened = state.open;
      window.clearTimeout(closeTimer);
      window.cancelAnimationFrame(openFrame);
      if (opened) {
        dialog.hidden = false;
        openFrame = window.requestAnimationFrame(() => {
          openFrame = window.requestAnimationFrame(() => {
            if (!disposed && profileStore.getState().open) dialog.classList.add("modal_open");
          });
        });
      } else {
        const animated = dialog.classList.contains("modal_open");
        dialog.classList.remove("modal_open");
        if (!animated) dialog.hidden = true;
        else
          closeTimer = window.setTimeout(() => {
            if (!disposed && !profileStore.getState().open) dialog.hidden = true;
          }, 200);
      }
    }
    showProfileView(dialog, state.view);
    password.render();
    twoFactor.render();
    avatar.render();
  }
  /** Склеивает несколько обновлений store в одну перерисовку. */
  function schedule(): void {
    if (disposed || queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      render();
    });
  }
  const unsubscribeProfile = profileStore.subscribe(schedule);
  const unsubscribeAuth = authStore.subscribe(schedule);
  page.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-profile-open]")) {
        void profileActions.openProfile();
        return;
      }
      if (!dialog.contains(target) && target !== dialog) return;
      if (target.closest("[data-profile-close]") || target === dialog) {
        profileActions.closeProfile();
        return;
      }
      if (target.closest("[data-profile-cancel]")) {
        profileActions.showView("menu");
        return;
      }
      if (onlineconfButton && !onlineconfButton.hidden && onlineconfButton.contains(target)) {
        window.location.assign("/onlineconf/");
        return;
      }
      if (target.closest("[data-profile-password]")) {
        profileActions.showView("password");
        return;
      }
      if (target.closest("[data-profile-two-factor]")) {
        if (authStore.getState().user?.is_2fa_enabled) profileActions.showView("twoFactorDisable");
        else void profileActions.generateTwoFactorQr();
        return;
      }
      if (target.closest("[data-profile-logout]")) {
        profileActions.closeProfile();
        options.onLogout();
      }
    },
    { signal: events.signal }
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && profileStore.getState().open) profileActions.closeProfile();
    },
    { signal: events.signal }
  );
  render();
  return () => {
    disposed = true;
    onlineconfRequest?.abort();
    events.abort();
    unsubscribeProfile();
    unsubscribeAuth();
    window.clearTimeout(closeTimer);
    window.cancelAnimationFrame(openFrame);
    password.destroy();
    twoFactor.destroy();
    avatar.destroy();
    profileActions.closeProfile();
  };
}
