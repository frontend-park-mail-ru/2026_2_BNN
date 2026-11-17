import { dispatcher } from "../app-dispatcher";
import { BaseStore } from "../base-store";
import type { OperationState, ProfileOperation, ProfileView } from "./profile-action-types";

/** Открыт ли диалог, какой экран показан и в каком состоянии его операции. */
interface ProfileState {
  open: boolean;
  view: ProfileView;
  context: number;
  qrUrl: string;
  operations: Record<ProfileOperation, OperationState>;
}
const idle = (): OperationState => ({ status: "idle", requestId: 0, context: 0, error: null });
const initialState = (): ProfileState => ({
  open: false,
  view: "menu",
  context: 0,
  qrUrl: "",
  operations: {
    load: idle(),
    avatar: idle(),
    password: idle(),
    qr: idle(),
    "enable-two-factor": idle(),
    "disable-two-factor": idle(),
  },
});

/** Хранит диалог профиля. Пользователь остаётся в AuthStore. */
class ProfileStore extends BaseStore<ProfileState> {
  /** Подписывает store на действия профиля и сброс сессии. */
  constructor() {
    super(initialState());
    dispatcher.register((action) => {
      switch (action.type) {
        case "profile/opened":
          this.state = {
            ...this.state,
            open: true,
            view: "loading",
            context: this.state.context + 1,
          };
          break;
        case "profile/closed":
          this.state = {
            ...this.state,
            open: false,
            view: "menu",
            context: this.state.context + 1,
          };
          break;
        case "profile/view-changed":
          this.state = { ...this.state, view: action.view, context: this.state.context + 1 };
          break;
        case "profile/qr-changed":
          this.state = { ...this.state, qrUrl: action.url };
          break;
        case "profile/operation-started":
          this.state = {
            ...this.state,
            operations: {
              ...this.state.operations,
              [action.operation]: {
                status: "pending",
                requestId: action.requestId,
                context: action.context,
                error: null,
              },
            },
          };
          break;
        case "profile/operation-finished": {
          const previous = this.state.operations[action.operation];
          if (previous.requestId !== action.requestId) return;
          this.state = {
            ...this.state,
            operations: {
              ...this.state.operations,
              [action.operation]: {
                ...previous,
                status: action.error ? "error" : "success",
                error: action.error,
              },
            },
          };
          break;
        }
        case "auth/data-cleared":
          this.state = initialState();
          break;
        default:
          return;
      }
      this.emit();
    });
  }
}
/** Единственный store диалога профиля. */
export const profileStore = new ProfileStore();
