import { ApiError } from "@/api";
import * as noteActions from "@/flux/notes/note-actions";
import { refreshRuntime } from "@/flux/runtime/runtime-actions";
import { runtimeConfigStore } from "@/flux/runtime/runtime-store";
import type { BlockContent } from "@/types/note";
import {
  acceptedAttachment,
  attachmentLimitMessage,
  FILE_ACCEPT,
  getAttachmentPolicyError,
  IMAGE_ACCEPT,
  pickFile,
  removeAttachment,
  UPLOAD_DISABLED_MESSAGE,
  type AttachmentRequest,
} from "@/pages/notes/attachments";
import { toBlockView } from "@/pages/notes/editor/block-view";
import { placeCaret } from "@/pages/notes/editor/caret";
import type { EditorDocument } from "@/pages/notes/editor/document";
/**
 * Загружает файлы в блоки и удаляет вложения, пока редактор открыт.
 *
 * @param options DOM заметки, сохранение и сообщения об ошибках.
 * @returns Команды вставки файла и ожидание незаконченных загрузок.
 */
export function createAttachmentInput(options: {
  mainRegion: HTMLElement;
  document: EditorDocument;
  timerSave: () => void;
  finishSaving: () => Promise<boolean>;
  isActive: () => boolean;
  showToast: (message: string, isError?: boolean) => void;
  goToLogin: () => Promise<void>;
  closeBlockMenu: () => void;
  beforeRemove: (block: HTMLElement) => void;
}) {
  const { mainRegion, timerSave, finishSaving, showToast, goToLogin, closeBlockMenu } = options;
  const { replaceBlock, insertBlockAfter, readBlock } = options.document;
  const pending = new Set<Promise<void>>();

  /** Объясняет отказ и обновляет пункты меню после попытки загрузки. */
  function showUploadError(message: string): void {
    showToast(message, true);
    if (message === UPLOAD_DISABLED_MESSAGE) runtimeConfigStore.recordAttachmentUploadDenial();
  }
  /**
   * Запоминает загрузку, чтобы уход со страницы мог её дождаться.
   *
   * @param operation Загрузка или удаление файла.
   * @returns Тот же запрос. Ошибка показывается тостом и не пробрасывается.
   */
  function track(operation: () => Promise<void>): Promise<void> {
    const request = operation()
      .catch(() => {
        if (options.isActive()) showToast("Не удалось обработать вложение", true);
      })
      .finally(() => pending.delete(request));
    pending.add(request);
    return request;
  }
  /**
   * Выбирает или принимает файл и загружает его в блок.
   *
   * @param block Блок, который станет вложением.
   * @param requested Картинка, файл или тип по содержимому.
   * @param given Файл, если его уже выбрали перетаскиванием.
   */
  function attachFile(
    block: HTMLElement,
    requested: AttachmentRequest,
    given?: File
  ): Promise<void> {
    return track(async () => {
      await uploadFile(block, requested, given);
    });
  }
  /**
   * Вставляет несколько перетащенных файлов, начиная с указанного блока.
   *
   * @param block Блок, на который бросили файлы.
   * @param files Файлы из события drop.
   */
  function attachFiles(block: HTMLElement, files: File[]): Promise<void> {
    return track(() => uploadFiles(block, files));
  }

  /**
   * Загружает файл в блок и показывает спиннер, пока запрос не закончился.
   *
   * @param block Блок, который станет картинкой или файлом.
   * @param requested Ожидаемый вид вложения.
   * @param given Файл из вставки или сброса. Без него откроется выбор файла.
   */
  async function uploadFile(
    block: HTMLElement,
    requested: AttachmentRequest,
    given?: File
  ): Promise<HTMLElement | undefined> {
    if (!runtimeConfigStore.getAttachmentPolicy().uploadEnabled) {
      showUploadError(UPLOAD_DISABLED_MESSAGE);
      return;
    }
    const file = given ?? (await pickFile(requested === "image" ? IMAGE_ACCEPT : FILE_ACCEPT));
    if (!file || !block.isConnected || !options.isActive()) {
      return;
    }
    const initialError = getAttachmentPolicyError(file);
    if (initialError) {
      showUploadError(initialError);
      return;
    }
    const type = await acceptedAttachment(file, requested, showToast);
    if (!type || !block.isConnected || !options.isActive()) {
      return;
    }

    const policyError = getAttachmentPolicyError(file);
    if (policyError) {
      showUploadError(policyError);
      return;
    }
    const inserted = !isEmptyParagraph(block);
    if (inserted) {
      const slot = insertBlockAfter(block, "text")?.closest<HTMLElement>("[data-block]");
      if (!slot) return;
      block = slot;
    }

    const original = readBlock(block) ?? { type: "text", text: "" };
    const content: BlockContent = { type, text: file.name, size: file.size };
    const uploading = replaceBlock(block, {
      ...toBlockView({ id: block.dataset.blockId ?? "", content }),
      isUploading: true,
    });
    const trailing = uploading.nextElementSibling
      ? null
      : insertBlockAfter(uploading, "text")?.closest<HTMLElement>("[data-block]");
    const nextText = uploading.nextElementSibling?.querySelector<HTMLElement>("[data-block-text]");
    if (nextText && document.activeElement === document.body) {
      placeCaret(nextText, false);
    }

    timerSave();
    const saved = await finishSaving();
    if (!uploading.isConnected || !options.isActive()) {
      return;
    }

    const blockId = uploading.dataset.blockId ?? "";
    let uploadError = saved && blockId ? "" : "Не удалось сохранить заметку";

    function rejectUpload(message: string): HTMLElement | undefined {
      if (!uploading.isConnected || !options.isActive()) return;
      let restored: HTMLElement | undefined;
      if (inserted) {
        options.beforeRemove(uploading);
        uploading.remove();
      } else {
        restored = replaceBlock(uploading, toBlockView({ id: blockId, content: original }));
      }
      if (
        trailing?.isConnected &&
        isEmptyParagraph(trailing) &&
        !trailing.contains(document.activeElement)
      ) {
        options.beforeRemove(trailing);
        trailing.remove();
      }
      timerSave();
      showUploadError(message);
      return restored;
    }

    if (saved && blockId) {
      const currentError = getAttachmentPolicyError(file);
      if (currentError) {
        return rejectUpload(currentError);
      }
      try {
        const attachment = await noteActions.uploadAttachment(blockId, file);
        content.attachmentId = attachment.id;
        content.url = attachment.url;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          if (options.isActive()) {
            await goToLogin();
          }
          return;
        }
        if (
          error instanceof ApiError &&
          error.status === 403 &&
          error.code === "FEATURE_DISABLED"
        ) {
          void refreshRuntime();
          return rejectUpload(UPLOAD_DISABLED_MESSAGE);
        }
        if (error instanceof ApiError && error.status === 413 && error.code === "FILE_TOO_LARGE") {
          return rejectUpload(
            attachmentLimitMessage(
              error.limitBytes ?? runtimeConfigStore.getAttachmentPolicy().maxFileSizeBytes
            )
          );
        }
        uploadError = error instanceof ApiError ? error.message : "Не удалось связаться с сервером";
      }
    }

    if (!uploading.isConnected || !options.isActive()) {
      return;
    }

    const view = toBlockView({ id: blockId, content });
    const result = replaceBlock(uploading, uploadError ? { ...view, uploadError } : view);
    timerSave();
    return result;
  }

  /** Можно ли использовать этот текстовый абзац для файла. */
  function isEmptyParagraph(block: HTMLElement): boolean {
    const content = readBlock(block);
    return content?.type === "text" && content.text === "";
  }

  /**
   * Ставит несколько файлов в заметку, каждый в свой блок.
   *
   * @param block Блок, с которого начинается вставка.
   * @param files Файлы из буфера или drop.
   */
  async function uploadFiles(block: HTMLElement, files: File[]): Promise<void> {
    closeBlockMenu();
    let anchor = block;
    for (const file of files) {
      if (!anchor.isConnected || !options.isActive()) return;
      if (!runtimeConfigStore.getAttachmentPolicy().uploadEnabled) {
        showUploadError(UPLOAD_DISABLED_MESSAGE);
        return;
      }
      anchor = (await uploadFile(anchor, "auto", file)) ?? anchor;
      if (runtimeConfigStore.getState().attachmentUploadDenied) return;
    }
  }

  /**
   * Удаляет блок вложения из редактора и файл на сервере.
   *
   * @param block Блок картинки или файла.
   */
  async function removeAttachmentBlock(block: HTMLElement): Promise<void> {
    const content = readBlock(block);

    await removeAttachment({
      block,
      attachmentId: content?.attachmentId,
      beforeRemove: () => {
        options.beforeRemove(block);
      },
      scheduleSave: timerSave,
    });
  }

  /**
   * Блок, в который попадут файлы из буфера. Без цели берётся последний блок.
   *
   * @param target Цель события.
   * @returns Блок или `null`, если в заметке блоков нет.
   */
  function findFileTarget(target: EventTarget | null): HTMLElement | null {
    const block = target instanceof Element ? target.closest<HTMLElement>("[data-block]") : null;
    const blocks = mainRegion.querySelectorAll<HTMLElement>("[data-block]");
    return block ?? blocks[blocks.length - 1] ?? null;
  }

  /**
   * Блок под курсором при перетаскивании файла.
   *
   * @param event Событие drag.
   * @returns Блок или `null`.
   */
  function findDropTarget(event: DragEvent): HTMLElement | null {
    const inNote = event.target instanceof Node && mainRegion.contains(event.target);
    return inNote ? findFileTarget(event.target) : null;
  }

  /**
   * Разрешает сброс файла на блок.
   *
   * @param event Перетаскивание над страницей.
   */
  function onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes("Files")) {
      event.preventDefault();
      const target = runtimeConfigStore.getState().attachmentUploadDenied
        ? null
        : findDropTarget(event);
      event.dataTransfer.dropEffect = target ? "copy" : "none";
      mainRegion.querySelector(".notebook")?.classList.toggle("notebook_drop", target !== null);
    }
  }

  /**
   * Снимает подсветку, когда файл уводят с блока.
   *
   * @param event Уход указателя с цели.
   */
  function onDragLeave(event: DragEvent): void {
    if (!event.relatedTarget) {
      mainRegion.querySelector(".notebook")?.classList.toggle("notebook_drop", false);
    }
  }

  /**
   * Загружает файлы, сброшенные на блок.
   *
   * @param event Сброс файлов.
   */
  function onDrop(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    mainRegion.querySelector(".notebook")?.classList.toggle("notebook_drop", false);
    const block = findDropTarget(event);
    if (block) {
      void attachFiles(block, Array.from(event.dataTransfer.files));
    }
  }
  /** Дожидается загрузок, которые ещё не закончились. */
  async function finish(): Promise<void> {
    while (pending.size) await Promise.all(pending);
  }
  return {
    attachFile,
    attachFiles,
    removeAttachmentBlock,
    findFileTarget,
    onDragOver,
    onDragLeave,
    onDrop,
    finish,
  };
}
