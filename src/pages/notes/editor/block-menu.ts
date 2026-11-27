import type { BlockType } from "@/types/note";
import type { AttachmentRequest } from "@/pages/notes/attachments";
import { toBlockView } from "@/pages/notes/editor/block-view";
import { placeCaret } from "@/pages/notes/editor/caret";
import { BLOCK_OPTIONS } from "@/pages/notes/editor/constants";
import type { EditorDocument } from "@/pages/notes/editor/document";
/**
 * Открывает меню типа блока по `/` и заменяет блок выбранным типом.
 *
 * @param options DOM заметки, сохранение и вставка файла.
 * @returns Команды меню, которые вызывает контроллер редактора.
 */
export function createBlockMenu(options: {
  mainRegion: HTMLElement;
  document: EditorDocument;
  timerSave: () => void;
  attachFile: (block: HTMLElement, requested: AttachmentRequest) => Promise<void>;
  createSubnote: (block: HTMLElement) => void;
}) {
  const { mainRegion, timerSave, attachFile } = options;
  const { replaceBlock } = options.document;

  /**
   * Показывает меню типа блока.
   *
   * @param block Блок, в котором ввели `/`.
   */
  function openBlockMenu(block: HTMLElement, fromToolbar = false): void {
    closeBlockMenu();
    block.insertAdjacentHTML(
      "beforeend",
      Handlebars.partials["block-menu"]({ options: BLOCK_OPTIONS })
    );

    const menu = block.querySelector<HTMLElement>("[data-block-menu]");
    const content = block.closest<HTMLElement>(".notebook__content");
    if (!menu || !content) {
      return;
    }
    menu.toggleAttribute("data-from-toolbar", fromToolbar);
    menu.addEventListener("focusin", (event) => {
      if (!(event.target instanceof HTMLElement) || !event.target.matches("[data-block-option]"))
        return;
      menu.querySelector(".block-menu__item_active")?.classList.remove("block-menu__item_active");
      event.target.classList.add("block-menu__item_active");
    });

    const gap = 6;
    const edgePadding = 8;
    const contentTop = content.getBoundingClientRect().top + content.clientTop;
    const blockRect = block.getBoundingClientRect();
    const menuHeight = menu.getBoundingClientRect().height;

    const visibleTop = Math.max(0, contentTop) + edgePadding;
    const visibleBottom =
      Math.min(window.innerHeight, contentTop + content.clientHeight) - edgePadding;

    const spaceBelow = Math.max(0, visibleBottom - blockRect.bottom - gap);
    const spaceAbove = Math.max(0, blockRect.top - visibleTop - gap);
    const openAbove = menuHeight > spaceBelow && spaceAbove > spaceBelow;
    const availableHeight = openAbove ? spaceAbove : spaceBelow;

    menu.style.maxHeight = `${Math.min(menuHeight, availableHeight)}px`;

    if (openAbove) {
      menu.style.top = "auto";
      menu.style.bottom = `calc(100% + ${gap}px)`;
    }
    if (fromToolbar) menu.focus({ preventScroll: true });
  }

  /**
   * Убирает меню типа блока.
   */
  function closeBlockMenu(): void {
    mainRegion.querySelector("[data-block-menu]")?.remove();
  }

  /**
   * Сдвигает подсветку пункта меню блока.
   *
   * @param menu Открытое меню.
   * @param step `1` вниз, `-1` вверх.
   */
  function moveBlockMenu(menu: HTMLElement, step: number): void {
    const items = Array.from(
      menu.querySelectorAll<HTMLElement>("[data-block-option], [data-selection-type]")
    );
    const current = items.findIndex((item) => item.classList.contains("block-menu__item_active"));
    const next = items[(current + step + items.length) % items.length];
    items[current]?.classList.remove("block-menu__item_active");
    next.classList.add("block-menu__item_active");
    if (menu.contains(document.activeElement) && menu !== document.activeElement) {
      next.focus({ preventScroll: true });
    }
    next.scrollIntoView({ block: "nearest" });
  }

  /**
   * Меняет тип блока и закрывает меню.
   *
   * @param block Текущий блок.
   * @param type Новый тип.
   */
  function chooseBlockType(block: HTMLElement, type: BlockType): void {
    const fromToolbar = !!block.querySelector("[data-block-menu][data-from-toolbar]");
    closeBlockMenu();
    if (fromToolbar) {
      const text = block.querySelector<HTMLElement>("[data-block-text]");
      if (block.dataset.blockType !== "text" || text?.textContent) {
        const inserted = options.document.insertBlockAfter(block, "text");
        const newBlock = inserted?.closest<HTMLElement>("[data-block]");
        if (!newBlock) return;
        block = newBlock;
      }
    }

    if (type === "subnote") {
      options.createSubnote(block);
      return;
    }

    if (type === "file" || type === "image") {
      void attachFile(block, type);
      return;
    }

    const next = replaceBlock(
      block,
      toBlockView({ id: block.dataset.blockId ?? "", content: { type, text: "" } })
    );
    const text = next.querySelector<HTMLElement>("[data-block-text]");
    if (text) {
      placeCaret(text, false);
    }
    timerSave();
  }
  return { openBlockMenu, closeBlockMenu, moveBlockMenu, chooseBlockType };
}
