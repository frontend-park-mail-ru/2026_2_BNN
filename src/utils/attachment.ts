export type ImageKind = "png" | "jpeg" | "gif" | "webp";
export type AttachmentKind = ImageKind | "pdf" | "invalid";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const GIF = [0x47, 0x49, 0x46, 0x38];
const PDF = [0x25, 0x50, 0x44, 0x46];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/**
 * Сравнивает начало файла с сигнатурой формата.
 *
 * @param bytes Прочитанное начало файла.
 * @param signature Ожидаемые байты.
 * @returns `true`, если файл начинается с этой сигнатуры.
 */
function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }
  return signature.every((value, index) => bytes[index] === value);
}

/**
 * Проверяет контейнер WebP: RIFF и метка WEBP на смещении 8.
 *
 * @param bytes Прочитанное начало файла.
 * @returns `true`, если это WebP.
 */
function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    startsWith(bytes, RIFF) &&
    bytes[8] === WEBP[0] &&
    bytes[9] === WEBP[1] &&
    bytes[10] === WEBP[2] &&
    bytes[11] === WEBP[3]
  );
}

/**
 * Убеждается, что браузер может декодировать файл как картинку.
 * Подменённое расширение проходит фильтр диалога, но не эту проверку.
 *
 * @param file Файл с подходящей сигнатурой.
 * @returns `true`, если картинка открывается.
 */
async function imageDecodes(file: File): Promise<boolean> {
  if (typeof createImageBitmap !== "function") {
    return true;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const ok = bitmap.width > 0 && bitmap.height > 0;
    bitmap.close();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Определяет вложение по содержимому, а не по расширению и `file.type`.
 *
 * @param file Файл из диалога, вставки или перетаскивания.
 * @returns Вид файла или `invalid`.
 */
export async function classifyAttachment(file: File): Promise<AttachmentKind> {
  if (file.size === 0) {
    return "invalid";
  }

  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (startsWith(bytes, PDF)) {
    return "pdf";
  }

  let image: ImageKind | null = null;
  if (startsWith(bytes, PNG)) {
    image = "png";
  } else if (startsWith(bytes, JPEG)) {
    image = "jpeg";
  } else if (startsWith(bytes, GIF)) {
    image = "gif";
  } else if (isWebp(bytes)) {
    image = "webp";
  }
  if (!image) {
    return "invalid";
  }
  return (await imageDecodes(file)) ? image : "invalid";
}
