import { BaseStore } from "@/flux/base-store";

export interface RuntimeSnapshot {
  user_id: string;
  revision: number;
  configs: Record<string, Record<string, unknown>>;
  flags: Record<string, Record<string, boolean>>;
}

const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

class RuntimeConfigStore extends BaseStore<{
  snapshot: RuntimeSnapshot | null;
  attachmentUploadDenied: boolean;
  attachmentUploadRestored: boolean;
  voiceInputDenialShown: boolean;
}> {
  constructor() {
    super({
      snapshot: null,
      attachmentUploadDenied: false,
      attachmentUploadRestored: false,
      voiceInputDenialShown: false,
    });
  }

  replace(snapshot: RuntimeSnapshot | null): void {
    if (
      this.state.snapshot === snapshot &&
      (snapshot !== null || !this.state.attachmentUploadDenied)
    )
      return;

    const sameSession =
      snapshot !== null &&
      (!this.state.snapshot || snapshot.user_id === this.state.snapshot.user_id);
    const enabled = snapshot?.flags.backend?.["attachments.upload_enabled"] !== false;
    const wasBlocked = !this.getAttachmentPolicy().uploadEnabled;

    this.state = {
      snapshot,
      voiceInputDenialShown:
        sameSession &&
        snapshot?.flags.frontend?.["notes.voice_input"] === false &&
        this.state.voiceInputDenialShown,
      attachmentUploadDenied: sameSession && !enabled && this.state.attachmentUploadDenied,
      attachmentUploadRestored:
        sameSession && enabled && (wasBlocked || this.state.attachmentUploadRestored),
    };
    this.emit();
  }

  /** Запоминает отказ после попытки загрузки до снятия запрета или смены сессии. */
  recordAttachmentUploadDenial(): void {
    if (this.state.attachmentUploadDenied) return;

    this.state = {
      ...this.state,
      attachmentUploadDenied: true,
      attachmentUploadRestored: false,
    };
    this.emit();
  }

  /** Забирает одно уведомление о снятии запрета при открытии меню блока. */
  consumeAttachmentUploadRestored(): boolean {
    if (!this.state.attachmentUploadRestored) return false;

    this.state = { ...this.state, attachmentUploadRestored: false };
    this.emit();
    return true;
  }

  /** Читает флаг голосового ввода. До получения настройки диктовка доступна. */
  isVoiceInputEnabled(): boolean {
    return this.getState().snapshot?.flags.frontend?.["notes.voice_input"] ?? true;
  }

  /** Запоминает уведомление на время текущего запрета для этого аккаунта. */
  recordVoiceInputDenial(): void {
    if (this.isVoiceInputEnabled() || this.state.voiceInputDenialShown) return;
    this.state = { ...this.state, voiceInputDenialShown: true };
    this.emit();
  }

  getAttachmentPolicy(): { uploadEnabled: boolean; maxFileSizeBytes: number } {
    const { snapshot, attachmentUploadDenied } = this.getState();
    const enabled = snapshot?.flags.backend?.["attachments.upload_enabled"];
    const limit = snapshot?.configs.backend?.["attachments.max_file_size_bytes"];

    return {
      uploadEnabled: !attachmentUploadDenied && (enabled ?? true),
      maxFileSizeBytes:
        typeof limit === "number" && Number.isSafeInteger(limit) && limit > 0
          ? limit
          : DEFAULT_MAX_FILE_SIZE_BYTES,
    };
  }
}

export const runtimeConfigStore = new RuntimeConfigStore();
