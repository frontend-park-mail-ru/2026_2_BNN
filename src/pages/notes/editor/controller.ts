import { notesStore } from "@/flux/notes/note-store";
import { runtimeConfigStore } from "@/flux/runtime/runtime-store";
import type { BlockType } from "@/types/note";
import { createVoiceInputController } from "@/pages/notes/voice-input/controller";
import { createVoiceInputView } from "@/pages/notes/voice-input/view";
import { createAttachmentInput } from "@/pages/notes/editor/attachment-input";
import { createBlockMenu } from "@/pages/notes/editor/block-menu";
import { cutAfterCaret, placeCaret } from "@/pages/notes/editor/caret";
import { LIST_TYPES, SAVE_STATUS, TITLE_MAX_LENGTH } from "@/pages/notes/editor/constants";
import { createEditorDocument } from "@/pages/notes/editor/document";
import {
  fragmentFromClipboard,
  useFormatTags,
  type InlineFormat,
} from "@/pages/notes/editor/inline-format";
import { createEditorPersistence } from "@/pages/notes/editor/persistence";
import { createEditorSelection } from "@/pages/notes/editor/selection";
import { getNoteDepth, MAX_NOTE_DEPTH } from "@/pages/notes/note-tree";
import { toBlockView } from "@/pages/notes/editor/block-view";
import * as noteActions from "@/flux/notes/note-actions";
import { mountBlockReorder } from "@/pages/notes/editor/block-reorder";

/** Узлы страницы и колбэки, которые редактор не берёт из store. */
export interface EditorOptions {
  page: HTMLElement;
  mainRegion: HTMLElement;
  noteId: string | undefined;
  isActive: () => boolean;
  goToLogin: () => Promise<void>;
  showToast: (message: string, isError?: boolean) => void;
  onCreated: (id: string) => void;
  showTitleInList: (title: string) => void;
  getNoteTagIds: () => string[];
}

/** Владеет DOM редактора, обработчиками и очередью сохранения одной заметки. */
export function createNoteEditor(options: EditorOptions) {
  const { page, mainRegion, showTitleInList } = options;
  let noteId = options.noteId;
  let focusedBlock: HTMLElement | null = null;
  let pendingSubnote: Promise<void> | null = null;
  let active = true;
  const isActive = () => active && options.isActive();
  const formatBar = page.querySelector<HTMLElement>("[data-format-bar]");
  const selectionTypeMenu = formatBar?.querySelector<HTMLElement>("[data-selection-types]");
  useFormatTags();
  const editorDocument = createEditorDocument(mainRegion, beforeReplace);
  const { readTitle, insertBlockAfter } = editorDocument;
  const selection = createEditorSelection({
    page,
    mainRegion,
    formatBar,
    timerSave,
    closeBlockMenu: () => menu.closeBlockMenu(),
  });
  const {
    markedBlocks,
    clearMarked,
    deleteMarked,
    handleBlockMotion,
    onEditorPointerDown,
    onEditorPointerMove,
    onEditorPointerUp,
    onEditorCopy,
    closeSelectionTypeMenu,
    toggleSelectionTypeMenu,
    changeSelectedBlockType,
    parkFormatBar,
    applySelectionFormat,
    placeFormatBar,
    onSelectionChange,
    onFormatMouseDown,
  } = selection;
  const menu = createBlockMenu({
    mainRegion,
    document: editorDocument,
    timerSave,
    attachFile: (block, requested) => attachments.attachFile(block, requested),
    createSubnote: startSubnote,
    showToast: options.showToast,
  });
  const { openBlockMenu, closeBlockMenu, moveBlockMenu, chooseBlockType } = menu;
  const persistence = createEditorPersistence({
    mainRegion,
    document: editorDocument,
    getNoteId: () => noteId,
    needsParent: () => pendingSubnote !== null,
    setNoteId: (id) => {
      noteId = id;
      if (isActive()) options.onCreated(id);
    },
    getNoteTagIds: options.getNoteTagIds,
    isActive,
    onUnauthorized: options.goToLogin,
  });
  const autosave = persistence.autosave;
  const attachments = createAttachmentInput({
    mainRegion,
    document: editorDocument,
    timerSave,
    finishSaving: () => autosave.flush(),
    isActive,
    showToast: options.showToast,
    goToLogin: options.goToLogin,
    closeBlockMenu,
    beforeRemove: beforeReplace,
  });
  const { attachFiles, findFileTarget, onDragOver, onDrop, onDragLeave } = attachments;
  const voiceInputView = createVoiceInputView({ mainRegion, insertBlockAfter, placeCaret });
  const voiceInput = createVoiceInputController({
    onFinal: voiceInputView.insertVoiceInputText,
    onInterim: voiceInputView.showInterim,
    onError: (message) => options.showToast(message, true),
    onActiveChange: voiceInputView.setVoiceInputActive,
  });

  let voiceInputEnabled = runtimeConfigStore.isVoiceInputEnabled();

  /** Синхронизирует кнопку и сообщает, когда диктовка снова доступна. */
  function syncVoiceInput(): void {
    const enabled = runtimeConfigStore.isVoiceInputEnabled();
    const { snapshot, voiceInputDenialShown } = runtimeConfigStore.getState();
    const restored = !voiceInputEnabled && enabled && snapshot !== null;
    if (voiceInputEnabled && !enabled) voiceInput.stop();
    voiceInputEnabled = enabled;

    const button = mainRegion.querySelector<HTMLButtonElement>("[data-voice-input-toggle]");
    if (!button) return;

    button.disabled = voiceInputDenialShown;
    button.classList.toggle("icon-button_disabled", voiceInputDenialShown);
    if (restored) options.showToast("Голосовой ввод снова доступен.");
  }

  /**
   * Убирает панель форматирования из блока, который сейчас заменят.
   *
   * @param block Блок перед заменой разметки.
   */
  function beforeReplace(block: HTMLElement): void {
    if (formatBar && block.contains(formatBar)) selection.parkFormatBar();
  }

  /** Планирует автосохранение после изменения в редакторе. */
  function timerSave(): void {
    autosave.schedule();
  }

  /** Планирует создание подзаметки после `/`. */
  function startSubnote(block: HTMLElement): void {
    if (pendingSubnote) return;

    pendingSubnote = createSubnote(block)
      .catch(() => {
        if (isActive()) {
          options.showToast("Не удалось создать подзаметку", true);
        }
      })
      .finally(() => {
        pendingSubnote = null;
      });
  }

  /** Создаёт подзаметку после `/`. */
  async function createSubnote(block: HTMLElement): Promise<void> {
    const text = block.querySelector<HTMLElement>("[data-block-text]");
    if (!text) return;
    const command = text.innerText.trim();
    if (command !== "/" && command !== "") return;

    if (!noteId) return;

    const depth = noteId === "new" ? 0 : getNoteDepth(notesStore.getState().notes, noteId);

    if (depth === null) {
      options.showToast("Не удалось определить уровень вложенности заметки", true);
      return;
    }

    if (depth >= MAX_NOTE_DEPTH) {
      options.showToast(`Достигнут предел вложенности — ${MAX_NOTE_DEPTH} уровней`, true);
      return;
    }

    // Для черновика persistence создаст родителя и обновит noteId.
    timerSave();
    if (!(await autosave.flush())) {
      options.showToast("Не удалось сохранить родительскую заметку", true);
      return;
    }

    const parentId = noteId;
    if (!parentId || parentId === "new" || !isActive()) return;
    if (!mainRegion.contains(block) || text.innerText.trim() !== command) return;

    const child = await noteActions.createNote({ parent_note_id: parentId });

    if (!isActive() || noteId !== parentId) return;

    // Пользователь мог изменить строку, пока шёл запрос.
    if (!mainRegion.contains(block) || text.innerText.trim() !== command) {
      options.showToast("Подзаметка создана. Её можно открыть в списке заметок.");
      return;
    }

    const view = toBlockView({
      id: block.dataset.blockId ?? "",
      content: { type: "subnote", text: "", childNoteId: child.id },
    });

    const inserted = editorDocument.replaceBlock(block, view);

    let following = inserted.nextElementSibling;
    while (following && !following.querySelector("[data-block-text]")) {
      following = following.nextElementSibling;
    }
    const nextText =
      following?.querySelector<HTMLElement>("[data-block-text]") ??
      insertBlockAfter(inserted, "text");
    if (nextText) placeCaret(nextText, false);

    timerSave();
    if (!(await autosave.flush()) && isActive()) {
      options.showToast("Подзаметка создана, но ссылку пока не удалось сохранить", true);
    }
  }

  /**
   * Горячие клавиши формата, Enter и переход каретки между блоками.
   *
   * @param event Клавиша внутри заметки.
   */
  function onNoteKeyDown(event: KeyboardEvent): void {
    const target = event.target;
    if (event.defaultPrevented || event.isComposing || !(target instanceof HTMLElement)) {
      return;
    }

    if (
      selectionTypeMenu &&
      !selectionTypeMenu.hidden &&
      ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)
    ) {
      event.preventDefault();

      if (event.key !== "Enter") {
        moveBlockMenu(selectionTypeMenu, event.key === "ArrowDown" ? 1 : -1);
        return;
      }

      const active = selectionTypeMenu.querySelector<HTMLElement>(".block-menu__item_active");

      if (active?.dataset.selectionType) {
        changeSelectedBlockType(active.dataset.selectionType as BlockType);
      }

      return;
    }

    const menu = mainRegion.querySelector<HTMLElement>("[data-block-menu]");
    if (menu && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      moveBlockMenu(menu, event.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (menu && event.key === "Enter") {
      event.preventDefault();
      const active = menu.querySelector<HTMLElement>(".block-menu__item_active");
      const block = menu.closest<HTMLElement>("[data-block]");
      if (active && block) {
        chooseBlockType(block, active.dataset.blockOption as BlockType);
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && target.closest("[data-block-text]") && !event.altKey) {
      const shortcuts: Record<string, InlineFormat> = {
        KeyB: "bold",
        KeyI: "italic",
        KeyU: "underline",
      };
      const format = event.shiftKey
        ? event.code === "KeyX"
          ? "strike"
          : undefined
        : shortcuts[event.code];
      if (format) {
        event.preventDefault();
        applySelectionFormat(format);
        placeFormatBar();
        timerSave();
        return;
      }
    }

    if (!event.ctrlKey && !event.metaKey && !event.altKey && markedBlocks().length > 1) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        deleteMarked();
        timerSave();
        return;
      }

      if (event.key.length === 1) {
        event.preventDefault();
        const host = deleteMarked();
        if (host) {
          host.textContent = event.key;
          placeCaret(host, true);
        }
        timerSave();
        return;
      }
    }

    const motionBlock = target.closest<HTMLElement>("[data-block]");
    const motionText = target.closest<HTMLElement>("[data-block-text]");
    if (
      motionBlock &&
      motionText &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      handleBlockMotion(event, motionBlock, motionText)
    ) {
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      if (target.matches("[data-note-title]")) {
        event.preventDefault();
        const first = mainRegion.querySelector<HTMLElement>("[data-block-text]");
        if (first) {
          placeCaret(first, false);
        }
        return;
      }

      const block = target.closest<HTMLElement>("[data-block]");
      const text = block?.querySelector<HTMLElement>("[data-block-text]");
      if (!block || !text) {
        return;
      }

      event.preventDefault();
      const tail = cutAfterCaret(text);
      const type = block.dataset.blockType as BlockType;
      const next = insertBlockAfter(block, LIST_TYPES.includes(type) ? type : "text");
      if (next) {
        if (tail) {
          next.append(tail);
        }
        placeCaret(next, false);
      }
      timerSave();
      return;
    }

    if (event.key === "Backspace") {
      const block = target.closest<HTMLElement>("[data-block]");
      const text = block?.querySelector<HTMLElement>("[data-block-text]");
      if (!block || !text) {
        return;
      }

      const selection = window.getSelection();
      if (!selection || !selection.isCollapsed || selection.rangeCount === 0) {
        return;
      }

      const range = selection.getRangeAt(0);
      if (!text.contains(range.startContainer)) {
        return;
      }

      const beforeCaret = document.createRange();
      beforeCaret.selectNodeContents(text);
      beforeCaret.setEnd(range.startContainer, range.startOffset);

      if (beforeCaret.toString() !== "") {
        return;
      }

      if (block.dataset.blockType !== "text") {
        event.preventDefault();
        closeBlockMenu();
        block.classList.remove(`notebook__block_${block.dataset.blockType}`);
        block.classList.add("notebook__block_text");
        block.dataset.blockType = "text";
        block.querySelector("[data-block-check]")?.remove();
        placeCaret(text, false);
        timerSave();
        return;
      }

      const previous =
        block.previousElementSibling?.querySelector<HTMLElement>("[data-block-text]");
      if (!previous || text.innerText.trim() !== "") {
        return;
      }

      event.preventDefault();
      if (formatBar && block.contains(formatBar)) {
        parkFormatBar();
      }
      block.remove();
      placeCaret(previous, true);
      timerSave();
    }
  }

  /**
   * Открывает меню по `/`, снимает лишнее выделение и ставит сохранение.
   *
   * @param event Ввод в заголовке или строке.
   */
  function onNoteInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.matches("[data-note-title]")) {
      if (event instanceof InputEvent && event.isComposing) {
        return;
      }

      const characters = Array.from(target.textContent ?? "");
      if (characters.length > TITLE_MAX_LENGTH) {
        target.textContent = characters.slice(0, TITLE_MAX_LENGTH).join("");
        placeCaret(target, true);
      }

      showTitleInList(readTitle());
    }

    if (target.matches("[data-block-text]")) {
      const block = target.closest<HTMLElement>("[data-block]");
      const extra = markedBlocks().filter((item) => item !== block);
      const formatting =
        selection.isApplyingFormat() ||
        (event instanceof InputEvent && event.inputType.startsWith("format"));
      if (extra.length > 0 && !formatting) {
        extra.forEach((item) => {
          if (formatBar && item.contains(formatBar)) {
            parkFormatBar();
          }
          item.remove();
        });
        clearMarked();
      }
      if (block && target.innerText.trim() === "/") {
        openBlockMenu(block);
      } else {
        closeBlockMenu();
      }
    }

    if (target.closest("[data-note-title], [data-block-text]")) {
      if (target.textContent === "") {
        target.replaceChildren();
      }
      timerSave();
    }
  }

  /**
   * Вставляет текст без чужой разметки или файлы из буфера.
   *
   * @param event Вставка на странице.
   */
  function onPaste(event: ClipboardEvent): void {
    const data = event.clipboardData;
    const target = event.target;
    if (
      data &&
      target instanceof HTMLElement &&
      target.closest("[data-block-text]") &&
      data.getData("text/plain") !== ""
    ) {
      event.preventDefault();
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return;
      }
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const fragment = fragmentFromClipboard(data);
      const marker = document.createTextNode("");
      fragment.append(marker);
      range.insertNode(fragment);
      range.setStartAfter(marker);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      marker.remove();
      timerSave();
      return;
    }

    if (
      !data ||
      data.files.length === 0 ||
      data.getData("text/plain") !== "" ||
      event.target instanceof HTMLInputElement
    ) {
      return;
    }

    const block = findFileTarget(event.target);
    if (block) {
      event.preventDefault();
      void attachFiles(block, Array.from(data.files));
    }
  }

  /**
   * Сохраняет заметку, когда переключают пункт чеклиста.
   *
   * @param event `change` внутри заметки.
   */
  function onNoteChange(event: Event): void {
    if (event.target instanceof HTMLInputElement && event.target.matches("[data-block-check]")) {
      timerSave();
    }
  }

  /**
   * Предупреждает о несохранённых правках при закрытии вкладки.
   *
   * @param event Закрытие или обновление страницы.
   */
  function onBeforeUnload(event: BeforeUnloadEvent): void {
    if (autosave.hasPending() || autosave.isSaving()) {
      event.preventDefault();
    }
  }

  /** Не даёт кнопке голосового ввода забрать фокус и каретку из текста заметки. */
  function onMainMouseDown(event: MouseEvent): void {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("[data-voice-input-toggle], [data-add-block], [data-note-menu-toggle]")
    ) {
      event.preventDefault();
    }
  }

  /**
   * Обрабатывает клики панели формата, меню блока, удаления вложения и микрофона.
   *
   * @param target Элемент, по которому кликнули.
   * @returns `true`, если клик относится к редактору.
   */
  function handleClick(target: Element): boolean {
    if (target.closest("[data-add-block]")) {
      if (mainRegion.querySelector("[data-block-menu]")) {
        closeBlockMenu();
        return true;
      }
      const block =
        focusedBlock && mainRegion.contains(focusedBlock)
          ? focusedBlock
          : mainRegion.querySelector<HTMLElement>("[data-note-body] > [data-block]");
      if (block) {
        block.scrollIntoView({ block: "nearest" });
        openBlockMenu(block, true);
      }
      return true;
    }
    const insert = target.closest("[data-insert-paragraph]");
    if (insert) {
      const previous = insert.closest("[data-block]")?.previousElementSibling;
      if (previous instanceof HTMLElement && previous.querySelector("[data-insert-paragraph]")) {
        const text = insertBlockAfter(previous, "text");
        if (text) {
          placeCaret(text, false);
          timerSave();
        }
      }
      return true;
    }
    if (target.closest("[data-selection-type-toggle]")) {
      toggleSelectionTypeMenu();
      return true;
    }
    const type = target.closest<HTMLElement>("[data-selection-type]")?.dataset.selectionType;
    if (type) {
      changeSelectedBlockType(type as BlockType);
      return true;
    }
    closeSelectionTypeMenu();
    const format = target.closest<HTMLElement>("[data-format]")?.dataset.format;
    if (format) {
      applySelectionFormat(format as InlineFormat);
      placeFormatBar();
      timerSave();
      return true;
    }
    if (!target.closest("[data-block-menu]")) closeBlockMenu();
    const option = target.closest<HTMLElement>("[data-block-option]");
    const block = option?.closest<HTMLElement>("[data-block]");
    if (option && block) {
      chooseBlockType(block, option.dataset.blockOption as BlockType);
      return true;
    }
    const attachment = target
      .closest("[data-attachment-remove]")
      ?.closest<HTMLElement>("[data-block]");
    if (attachment) {
      void attachments.removeAttachmentBlock(attachment);
      return true;
    }
    if (target.closest("[data-voice-input-toggle]")) {
      if (runtimeConfigStore.isVoiceInputEnabled()) {
        voiceInput.toggle();
      } else if (!runtimeConfigStore.getState().voiceInputDenialShown) {
        options.showToast("Голосовой ввод сейчас отключён.", true);
        runtimeConfigStore.recordVoiceInputDenial();
      }
      return true;
    }
    return false;
  }

  /** Сбрасывает выделение, панель и меню перед перерисовкой заметки. */
  function resetSelection(): void {
    cancelBlockReorder();
    voiceInput.abort();
    clearMarked();
    parkFormatBar();
    closeBlockMenu();
  }

  /** По Escape останавливает диктовку и закрывает меню редактора. */
  function escape(): void {
    voiceInput.stop();
    clearMarked();
    closeSelectionTypeMenu();
    closeBlockMenu();
  }

  let lastStatus = notesStore.getState().saveStatus;

  /** Обновляет подпись «Сохраняется…», «Сохранено» или «Не сохранено». */
  function renderSaveStatus(): void {
    const status = notesStore.getState().saveStatus;
    const label = mainRegion.querySelector<HTMLElement>("[data-save-status]");
    if (label) {
      label.textContent = SAVE_STATUS[status];
      label.classList.toggle("notebook__save-status_error", status === "error");
    }
  }

  const unsubscribe = notesStore.subscribe(() => {
    const status = notesStore.getState().saveStatus;
    if (status !== lastStatus) {
      lastStatus = status;
      renderSaveStatus();
    }
  });

  const events = new AbortController();
  const signal = events.signal;
  const unsubscribeRuntime = runtimeConfigStore.subscribe(() => {
    menu.syncAttachmentOptions();
    syncVoiceInput();
  });
  signal.addEventListener("abort", unsubscribeRuntime, { once: true });
  syncVoiceInput();
  const cancelBlockReorder = mountBlockReorder(mainRegion, timerSave, signal);
  mainRegion.addEventListener(
    "focusin",
    (event) => {
      if (event.target instanceof Element) {
        const block = event.target.closest<HTMLElement>("[data-block]");
        if (block || event.target.matches("[data-note-title]")) focusedBlock = block;
      }
    },
    { signal }
  );
  mainRegion.addEventListener("input", onNoteInput, { signal });
  mainRegion.addEventListener("change", onNoteChange, { signal });
  mainRegion.addEventListener("keydown", onNoteKeyDown, { signal });
  mainRegion.addEventListener("pointerdown", onMainMouseDown, { signal });
  mainRegion.addEventListener("scroll", onSelectionChange, { signal, capture: true });
  document.addEventListener("selectionchange", onSelectionChange, { signal });
  document.addEventListener("pointerdown", onEditorPointerDown, { signal });
  document.addEventListener("pointermove", onEditorPointerMove, { signal });
  document.addEventListener("pointerup", onEditorPointerUp, { signal });
  document.addEventListener("pointercancel", onEditorPointerUp, { signal });
  mainRegion.addEventListener("copy", onEditorCopy, { signal });
  mainRegion.addEventListener("cut", onEditorCopy, { signal });
  formatBar?.addEventListener("pointerdown", onFormatMouseDown, { signal });
  window.addEventListener("beforeunload", onBeforeUnload, { signal });
  window.addEventListener("paste", onPaste, { signal });
  window.addEventListener("dragover", onDragOver, { signal });
  window.addEventListener("drop", onDrop, { signal });
  window.addEventListener("dragleave", onDragLeave, { signal });

  return {
    /** Идентификатор открытой заметки. `new` означает ещё не созданный черновик. */
    get noteId() {
      return noteId;
    },

    /**
     * Запоминает id после создания черновика или перехода к другой заметке.
     *
     * @param id Идентификатор заметки.
     */
    set noteId(id: string | undefined) {
      noteId = id;
    },
    handleClick,
    escape,
    resetSelection,
    syncVoiceInput,
    scheduleSave: timerSave,
    retrySave: () => autosave.run(),
    clearSave: () => autosave.clear(),

    /**
     * Останавливает диктовку, дожидается загрузок и сохраняет заметку.
     *
     * @returns `false`, если сохранить не удалось.
     */
    async beforeLeave(): Promise<boolean> {
      voiceInput.abort();
      await attachments.finish();
      await pendingSubnote;
      return autosave.flush();
    },

    /** Снимает обработчики редактора и отменяет незапущенное сохранение. */
    destroy(): void {
      active = false;
      events.abort();
      unsubscribe();
      voiceInput.abort();
      autosave.clear();
    },
  };
}

/** Редактор одной заметки: идентификатор, сохранение и снятие обработчиков. */
export type NoteEditor = ReturnType<typeof createNoteEditor>;
