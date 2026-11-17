import * as noteActions from "../../flux/notes/note-actions";
import type { BlockType } from "../../types/note";
import { classifyAttachment } from "./attachment-validation";

/** Значение `accept` для выбора изображения. */
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
/** Значение `accept` для выбора изображения или PDF. */
export const FILE_ACCEPT = IMAGE_ACCEPT + ",application/pdf";

/** Что пользователь просил вставить: картинку, файл или то, что определится по содержимому. */
export type AttachmentRequest = "image" | "file" | "auto";

/**
 * Собирает подпись файла: расширение и размер.
 *
 * @param name Имя файла.
 * @param size Размер в байтах. Без него остаётся только расширение.
 * @returns Строка вида `PDF · 1,2 МБ`.
 */
export function formatFileMeta(name: string, size?: number): string {
  const extension = name.match(/\.([^.]+)$/)?.[1].toUpperCase() || "Файл";

  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
    return extension;
  }

  const units = ["Б", "КБ", "МБ", "ГБ"];
  const unitIndex = Math.min(
    Math.floor(Math.log(Math.max(size, 1)) / Math.log(1024)),
    units.length - 1
  );
  const value = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(size / 1024 ** unitIndex);

  return `${extension} · ${value} ${units[unitIndex]}`;
}

/**
 * Открывает системный диалог выбора одного файла.
 *
 * @param accept Список MIME-типов для атрибута `accept`.
 * @returns Выбранный файл или `null`, если диалог закрыли.
 */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/**
 * Проверяет содержимое файла и решает, каким блоком его вставлять.
 *
 * @param file Выбранный файл.
 * @param requested Что ожидает команда: картинку, файл или любой поддерживаемый тип.
 * @param showToast Сообщение, если формат не подходит.
 * @returns Тип блока или `null`, если файл отклонили.
 */
export async function acceptedAttachment(
  file: File,
  requested: AttachmentRequest,
  showToast: (message: string, isError: boolean) => void
): Promise<BlockType | null> {
  const kind = await classifyAttachment(file);
  const image = kind === "png" || kind === "jpeg" || kind === "gif" || kind === "webp";
  if (requested === "image") {
    if (!image) {
      showToast("Это не изображение. Подойдут PNG, JPEG, WebP или GIF.", true);
      return null;
    }
    return "image";
  }
  if (!image && kind !== "pdf") {
    showToast("Можно прикрепить только PNG, JPEG, WebP, GIF или PDF.", true);
    return null;
  }
  if (requested === "auto" && image) {
    return "image";
  }
  return "file";
}

/** Блок, который нужно убрать из редактора, и колбэки сохранения. */
interface RemoveAttachmentOptions {
  block: HTMLElement;
  attachmentId: string | undefined;
  beforeRemove: () => void;
  scheduleSave: () => void;
}

/**
 * Убирает блок вложения из редактора и удаляет файл на сервере.
 * Ошибка удаления на сервере не возвращает блок: в редакторе его уже нет.
 *
 * @param options Блок, id вложения и колбэки редактора.
 */
export async function removeAttachment({
  block,
  attachmentId,
  beforeRemove,
  scheduleSave,
}: RemoveAttachmentOptions): Promise<void> {
  beforeRemove();
  block.remove();
  scheduleSave();

  if (attachmentId) {
    await noteActions.deleteAttachment(attachmentId).catch(() => null);
  }
}
