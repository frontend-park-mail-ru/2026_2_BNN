import { api, ApiError } from "../../api";
import type { TagInput } from "../../types/tag";
import type { Tag } from "../../types/tag";
import { dispatcher } from "../app-dispatcher";

let sessionVersion = 0;
let mutationVersion = 0;
let loading: Promise<Tag[]> | null = null;
dispatcher.register((action) => {
  if (action.type === "auth/data-cleared") {
    sessionVersion += 1;
    loading = null;
  }
});

/**
 * Загружает справочник тегов. Повторный вызов присоединяется к текущему запросу.
 * Ответ не записывается, если за время запроса тег уже создали, изменили или удалили.
 *
 * @returns Теги с сервера.
 */
export function loadTags(): Promise<Tag[]> {
  if (loading) return loading;
  const version = sessionVersion;
  const revision = mutationVersion;
  const request = api
    .getTags()
    .then(
      (tags) => {
        if (version !== sessionVersion)
          throw new Error("Сессия изменилась во время загрузки тегов");
        if (revision === mutationVersion) dispatcher.dispatch({ type: "tags/loaded", tags });
        return tags;
      },
      (error) => {
        if (version !== sessionVersion)
          throw new Error("Сессия изменилась во время загрузки тегов");
        throw error;
      }
    )
    .finally(() => {
      if (loading === request) loading = null;
    });
  loading = request;
  return request;
}

/**
 * Создаёт тег и добавляет его в справочник.
 *
 * @param input Название и цвет.
 * @returns Созданный тег.
 */
export async function createTag(input: TagInput) {
  const version = sessionVersion;
  mutationVersion += 1;
  const tag = await api.createTag(input);
  if (version !== sessionVersion) throw new Error("Сессия изменилась во время создания тега");
  mutationVersion += 1;
  dispatcher.dispatch({ type: "tags/saved", tag });
  return tag;
}

/**
 * Меняет название или цвет тега.
 *
 * @param id Идентификатор тега.
 * @param input Новые название и цвет.
 * @returns Обновлённый тег.
 */
export async function updateTag(id: string, input: TagInput) {
  const version = sessionVersion;
  mutationVersion += 1;
  const tag = await api.updateTag(id, input);
  if (version !== sessionVersion) throw new Error("Сессия изменилась во время изменения тега");
  mutationVersion += 1;
  dispatcher.dispatch({ type: "tags/saved", tag });
  return tag;
}

/**
 * Удаляет тег из справочника и из фильтра. Ответ 404 считается успехом.
 *
 * @param id Идентификатор тега.
 */
export async function deleteTag(id: string): Promise<void> {
  const version = sessionVersion;
  mutationVersion += 1;
  try {
    await api.deleteTag(id);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }
  if (version !== sessionVersion) throw new Error("Сессия изменилась во время удаления тега");
  mutationVersion += 1;
  dispatcher.dispatch({ type: "tags/deleted", id });
}

/**
 * Добавляет тег в фильтр списка или убирает его.
 *
 * @param id Идентификатор тега.
 */
export function toggleFilter(id: string): void {
  dispatcher.dispatch({ type: "tags/filter-toggled", id });
}

/**
 * Заменяет фильтр списка заметок.
 *
 * @param ids Выбранные теги. Пустой массив снимает фильтр.
 */
export function setFilter(ids: string[]): void {
  dispatcher.dispatch({ type: "tags/filter-replaced", ids });
}
