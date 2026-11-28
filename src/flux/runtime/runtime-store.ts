import { BaseStore } from "@/flux/base-store";

export interface RuntimeSnapshot {
  user_id: string;
  revision: number;
  configs: Record<string, Record<string, unknown>>;
  flags: Record<string, Record<string, boolean>>;
}

const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

class RuntimeConfigStore extends BaseStore<{ snapshot: RuntimeSnapshot | null }> {
  constructor() {
    super({ snapshot: null });
  }

  replace(snapshot: RuntimeSnapshot | null): void {
    if (this.state.snapshot === snapshot) return;

    this.state = { snapshot };
    this.emit();
  }

  getAttachmentPolicy(): { uploadEnabled: boolean; maxFileSizeBytes: number } {
    const { snapshot } = this.getState();
    const enabled = snapshot?.flags.backend?.["attachments.upload_enabled"];
    const limit = snapshot?.configs.backend?.["attachments.max_file_size_bytes"];

    return {
      uploadEnabled: enabled ?? true,
      maxFileSizeBytes:
        typeof limit === "number" && Number.isSafeInteger(limit) && limit > 0
          ? limit
          : DEFAULT_MAX_FILE_SIZE_BYTES,
    };
  }
}

export const runtimeConfigStore = new RuntimeConfigStore();
