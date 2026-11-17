import type { Tag } from "../../types/tag";
import { sortTags } from "../../domain/tags";
import { dispatcher } from "../app-dispatcher";
import { BaseStore } from "../base-store";

/** Справочник тегов и id, выбранные в фильтре списка. */
interface TagState {
  tags: Tag[];
  activeIds: string[];
}

/** Хранит справочник тегов и активный фильтр. */
class TagStore extends BaseStore<TagState> {
  /** Подписывает store на действия тегов и сброс сессии. */
  constructor() {
    super({ tags: [], activeIds: [] });
    dispatcher.register((action) => {
      switch (action.type) {
        case "tags/loaded":
          this.state = {
            tags: action.tags.slice(),
            activeIds: this.state.activeIds.filter((id) =>
              action.tags.some((tag) => tag.id === id)
            ),
          };
          break;
        case "tags/saved":
          this.state = {
            ...this.state,
            tags: sortTags([
              ...this.state.tags.filter((tag) => tag.id !== action.tag.id),
              action.tag,
            ]),
          };
          break;
        case "tags/deleted":
          this.state = {
            tags: this.state.tags.filter((tag) => tag.id !== action.id),
            activeIds: this.state.activeIds.filter((id) => id !== action.id),
          };
          break;
        case "tags/filter-toggled":
          this.state = {
            ...this.state,
            activeIds: this.state.activeIds.includes(action.id)
              ? this.state.activeIds.filter((id) => id !== action.id)
              : [...this.state.activeIds, action.id],
          };
          break;
        case "tags/filter-replaced":
          this.state = { ...this.state, activeIds: [...action.ids] };
          break;
        case "auth/data-cleared":
          this.state = { tags: [], activeIds: [] };
          break;
        default:
          return;
      }
      this.emit();
    });
  }
}

/** Единственный store тегов. */
export const tagStore = new TagStore();
