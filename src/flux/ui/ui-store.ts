import { dispatcher } from "../app-dispatcher";
import { BaseStore } from "../base-store";
import type { Theme } from "./ui-action-types";

/** Тема, доступность сети и текущий тост. */
interface UiState {
  theme: Theme;
  online: boolean;
  toast: { message: string; isError: boolean } | null;
}

/** Хранит состояние интерфейса, которое не относится к одной странице. */
class UiStore extends BaseStore<UiState> {
  /** Подписывает store на действия темы, сети и тоста. */
  constructor() {
    super({ theme: "light", online: true, toast: null });
    dispatcher.register((action) => {
      switch (action.type) {
        case "ui/theme-changed":
          this.state = { ...this.state, theme: action.theme };
          break;
        case "ui/connection-changed":
          this.state = { ...this.state, online: action.online };
          break;
        case "ui/toast-shown":
          this.state = {
            ...this.state,
            toast: { message: action.message, isError: action.isError },
          };
          break;
        case "ui/toast-hidden":
          this.state = { ...this.state, toast: null };
          break;
        default:
          return;
      }
      this.emit();
    });
  }
}

/** Единственный store интерфейса. */
export const uiStore = new UiStore();
