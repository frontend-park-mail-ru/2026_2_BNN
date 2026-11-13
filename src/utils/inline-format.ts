const MARKS = [
  { open: "\uE000", close: "\uE001", tag: "strong" },
  { open: "\uE002", close: "\uE003", tag: "em" },
  { open: "\uE004", close: "\uE005", tag: "u" },
  { open: "\uE006", close: "\uE007", tag: "s" },
] as const;

const TAG_MARK: Record<string, (typeof MARKS)[number]> = {
  STRONG: MARKS[0],
  B: MARKS[0],
  EM: MARKS[1],
  I: MARKS[1],
  U: MARKS[2],
  S: MARKS[3],
  STRIKE: MARKS[3],
  DEL: MARKS[3],
};

const COMMANDS = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strike: "strikeThrough",
} as const;

export type InlineFormat = keyof typeof COMMANDS;

/**
 * Экранирует текст так же, как обычные скобки Handlebars.
 * Маркеры форматирования — символы частной зоны Unicode, их экранирование не трогает.
 *
 * @param text Сырой текст блока.
 * @returns Строка, которую можно вставлять в HTML.
 */
function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Собирает HTML из уже экранированного текста, заменяя только парные маркеры.
 *
 * @param text Экранированный текст.
 * @returns HTML с тегами strong, em, u и s.
 */
function renderMarks(text: string): string {
  let earliest: { index: number; mark: (typeof MARKS)[number] } | null = null;
  for (const mark of MARKS) {
    const index = text.indexOf(mark.open);
    if (index !== -1 && (earliest === null || index < earliest.index)) {
      earliest = { index, mark };
    }
  }
  if (!earliest) {
    return text;
  }

  const close = text.indexOf(earliest.mark.close, earliest.index + 1);
  if (close === -1) {
    return text.slice(0, earliest.index) + renderMarks(text.slice(earliest.index + 1));
  }

  const before = text.slice(0, earliest.index);
  const inner = renderMarks(text.slice(earliest.index + 1, close));
  const after = renderMarks(text.slice(close + 1));
  return `${before}<${earliest.mark.tag}>${inner}</${earliest.mark.tag}>${after}`;
}

/**
 * Готовит текст блока к выводу: сначала экранирование, затем только наши теги.
 *
 * @param text Текст из хранилища заметки.
 * @returns Безопасный HTML.
 */
export function renderInlineHtml(text: string): string {
  return renderMarks(escapeHtml(text)).replace(/[\uE001\uE003\uE005\uE007]/g, "");
}

/**
 * Регистрирует помощник Handlebars `inline`.
 * Обычные скобки `{{inline text}}` не экранируют результат повторно:
 * помощник возвращает SafeString, в котором опасные символы уже заменены.
 *
 * @returns {void}
 */
export function registerInlineFormatHelper(): void {
  Handlebars.registerHelper("inline", (value: unknown) => {
    return new Handlebars.SafeString(renderInlineHtml(typeof value === "string" ? value : ""));
  });
}

/**
 * Складывает разметку contenteditable обратно в текст с маркерами.
 * Стили и посторонние теги не сохраняются: жирный, курсив, подчёркивание и зачёркивание.
 *
 * @param root Элемент `[data-block-text]`.
 * @returns Текст для API.
 */
export function serializeInline(root: Node): string {
  let out = "";

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) {
      return;
    }

    const mark = TAG_MARK[node.tagName];
    if (mark) {
      out += mark.open;
      node.childNodes.forEach(walk);
      out += mark.close;
      return;
    }

    if (node.tagName === "BR") {
      out += "\n";
      return;
    }

    if ((node.tagName === "DIV" || node.tagName === "P") && out.length > 0 && !out.endsWith("\n")) {
      out += "\n";
    }
    node.childNodes.forEach(walk);
  };

  root.childNodes.forEach(walk);
  return out.replaceAll("\u00a0", " ").replace(/\n$/, "");
}

/**
 * Просит браузер ставить теги, а не `style=""`.
 * Иначе жирный текст нечем прочитать обратно и его срежет CSP.
 *
 * @returns {void}
 */
export function useFormatTags(): void {
  document.execCommand("styleWithCSS", false, "false");
}

/**
 * Применяет формат к текущему выделению.
 *
 * @param format Команда панели.
 * @returns {void}
 */
export function applyInlineFormat(format: InlineFormat): void {
  useFormatTags();
  document.execCommand(COMMANDS[format]);
}

/**
 * Проверяет, действует ли формат в текущем выделении.
 *
 * @param format Команда панели.
 * @returns `true`, если формат включён.
 */
export function inlineFormatState(format: InlineFormat): boolean {
  try {
    return document.queryCommandState(COMMANDS[format]);
  } catch {
    return false;
  }
}

/**
 * Оставляет во вставленном HTML только текст и четыре формата.
 *
 * @param node Узел из буфера обмена.
 * @param target Куда складывать безопасные узлы.
 * @returns {void}
 */
function appendSanitized(node: Node, target: ParentNode): void {
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      target.append(child.textContent ?? "");
      return;
    }
    if (!(child instanceof HTMLElement)) {
      return;
    }
    if (child.tagName === "BR") {
      target.append(document.createElement("br"));
      return;
    }
    if (TAG_MARK[child.tagName]) {
      const element = document.createElement(TAG_MARK[child.tagName].tag);
      appendSanitized(child, element);
      target.append(element);
      return;
    }
    if (child.tagName === "DIV" || child.tagName === "P") {
      if (target.childNodes.length > 0) {
        target.append(document.createElement("br"));
      }
      appendSanitized(child, target);
      return;
    }
    appendSanitized(child, target);
  });
}

/**
 * Превращает вставку в фрагмент без чужих стилей, скриптов и картинок.
 *
 * @param data Буфер обмена.
 * @returns Фрагмент для вставки в блок.
 */
export function fragmentFromClipboard(data: DataTransfer): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const html = data.getData("text/html");
  if (html) {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const holder = document.createElement("div");
    appendSanitized(parsed.body, holder);
    if (holder.textContent) {
      fragment.append(...holder.childNodes);
      return fragment;
    }
  }
  fragment.append(data.getData("text/plain"));
  return fragment;
}
