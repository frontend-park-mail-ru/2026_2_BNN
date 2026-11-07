import type { Tag } from "../api";

/** Цвет из палитры тегов. */
export interface TagColor {
  color: string;
  label: string;
}

/** Палитра тегов, подобранная под акцентный голубой интерфейса. */
export const TAG_PALETTE: TagColor[] = [
  { color: "#73B0FFFF", label: "Голубой" },
  { color: "#5CC9A7FF", label: "Мятный" },
  { color: "#8BCF6AFF", label: "Зелёный" },
  { color: "#F5C451FF", label: "Жёлтый" },
  { color: "#FF9F5AFF", label: "Оранжевый" },
  { color: "#F47C7CFF", label: "Коралловый" },
  { color: "#F28FC5FF", label: "Розовый" },
  { color: "#A98BF0FF", label: "Сиреневый" },
  { color: "#9AA8BAFF", label: "Серый" },
];

export const TAG_NAME_MAX_LENGTH = 30;

const TAG_COLOR_PATTERN = /^#[0-9a-f]{8}$/i;
const FALLBACK_COLOR = TAG_PALETTE[TAG_PALETTE.length - 1].color;

/** Данные тега для шаблонов. */
export interface TagView {
  id: string;
  name: string;
  color: string;
}

/**
 * Возвращает цвет, который можно безопасно подставить в `style`.
 *
 * @param color Цвет из API.
 * @returns Исходный цвет или серый, если формат неожиданный.
 */
export function safeTagColor(color: string): string {
  return TAG_COLOR_PATTERN.test(color) ? color : FALLBACK_COLOR;
}

/**
 * Готовит тег к отрисовке.
 *
 * @param tag Тег из API.
 * @returns Данные для шаблона.
 */
export function toTagView(tag: Tag): TagView {
  return { id: tag.id, name: tag.name, color: safeTagColor(tag.color) };
}

/**
 * Подбирает цвет для нового тега: первый ещё не занятый цвет палитры.
 *
 * @param tags Существующие теги.
 * @returns Цвет `#RRGGBBAA`.
 */
export function nextTagColor(tags: Tag[]): string {
  const used = new Set(tags.map((tag) => tag.color.toUpperCase()));
  const free = TAG_PALETTE.find((item) => !used.has(item.color));
  return (free ?? TAG_PALETTE[tags.length % TAG_PALETTE.length]).color;
}

/**
 * Сортирует теги по названию, как это делает бэкенд.
 *
 * @param tags Теги.
 * @returns Новый отсортированный массив.
 */
export function sortTags(tags: Tag[]): Tag[] {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

/**
 * Ищет тег с таким же названием без учёта регистра.
 *
 * @param tags Существующие теги.
 * @param name Название.
 * @returns Найденный тег или `null`.
 */
export function findTagByName(tags: Tag[], name: string): Tag | null {
  const key = name.trim().toLowerCase();
  return tags.find((tag) => tag.name.toLowerCase() === key) ?? null;
}
