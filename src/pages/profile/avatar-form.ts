import * as profileActions from "../../flux/profile/profile-actions";
import { profileStore } from "../../flux/profile/profile-store";
import { showToast } from "../../flux/ui/ui-actions";
import { AvatarCrop } from "./avatar-crop";

const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AVATAR_LIMIT = 5 * 1024 * 1024;

/**
 * Подключает выбор, кадрирование и сохранение аватара.
 *
 * @param dialog Диалог профиля.
 * @returns Перерисовка по store и снятие обработчиков.
 */
export function mountAvatarForm(dialog: HTMLElement) {
  const events = new AbortController();
  let crop: AvatarCrop | null = null;
  let token = 0;
  let preparing = false;
  let disposed = false;
  /** Сбрасывает кадрирование и отменяет незавершённую подготовку картинки. */
  function clear(): void {
    token++;
    crop?.destroy();
    crop = null;
    preparing = false;
  }
  /** Обновляет кнопки кадрирования по экрану профиля и статусу загрузки. */
  function render(): void {
    const state = profileStore.getState();
    if (!state.open || state.view !== "avatar") clear();
    const saving = preparing || state.operations.avatar.status === "pending";
    const save = dialog.querySelector<HTMLButtonElement>("[data-avatar-save]");
    const cancel = dialog.querySelector<HTMLButtonElement>("[data-avatar-cancel]");
    const input = dialog.querySelector<HTMLInputElement>("[data-avatar-input]");
    if (save) {
      save.disabled = saving || !crop;
      save.textContent = saving ? "Сохраняем…" : "Сохранить";
    }
    if (cancel) cancel.disabled = saving;
    if (input) input.disabled = state.operations.avatar.status === "pending";
    if (saving) crop?.lock();
    else crop?.unlock();
  }
  /**
   * Проверяет файл и открывает кадрирование.
   *
   * @param file Выбранное изображение.
   */
  async function start(file: File): Promise<void> {
    const canvas = dialog.querySelector("canvas[data-avatar-crop]");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    clear();
    profileActions.showView("avatar");
    const request = token;
    const context = profileStore.getState().context;
    try {
      const next = await AvatarCrop.open(canvas, file);
      if (
        disposed ||
        request !== token ||
        profileStore.getState().context !== context ||
        !profileStore.getState().open
      ) {
        next?.destroy();
        return;
      }
      if (!next) {
        showToast("Не удалось открыть изображение", true);
        profileActions.showView("menu");
        return;
      }
      crop = next;
      render();
    } catch {
      if (!disposed && request === token) {
        showToast("Не удалось открыть изображение", true);
        profileActions.showView("menu");
      }
    }
  }
  /** Отправляет обрезанный аватар и закрывает кадрирование после успеха. */
  async function save(): Promise<void> {
    if (!crop || preparing || profileStore.getState().operations.avatar.status === "pending")
      return;
    const current = crop;
    const request = token;
    const context = profileStore.getState().context;
    preparing = true;
    render();
    try {
      const file = await current.toFile();
      if (disposed || request !== token || profileStore.getState().context !== context) return;
      if (!file) {
        showToast("Не удалось подготовить аватар", true);
        return;
      }
      if (file.size > AVATAR_LIMIT) {
        showToast("После обрезки файл больше 5 МБ", true);
        return;
      }
      void profileActions.updateAvatar(file);
    } catch {
      if (!disposed && request === token) showToast("Не удалось подготовить аватар", true);
    } finally {
      if (!disposed && request === token) {
        preparing = false;
        render();
      }
    }
  }
  dialog.addEventListener(
    "change",
    (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.matches("[data-avatar-input]")) return;
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      if (!AVATAR_TYPES.includes(file.type)) {
        showToast("Нужен файл JPEG, PNG или WebP", true);
        return;
      }
      if (file.size > AVATAR_LIMIT) {
        showToast("Файл больше 5 МБ", true);
        return;
      }
      void start(file);
    },
    { signal: events.signal }
  );
  dialog.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-avatar-save]")) void save();
      if (target.closest("[data-avatar-cancel]")) profileActions.showView("menu");
    },
    { signal: events.signal }
  );
  return {
    render,
    /** Снимает обработчики и уничтожает кадрирование. */
    destroy(): void {
      disposed = true;
      events.abort();
      clear();
    },
  };
}
