/** Тег пользователя. */
export interface Tag {
  id: string;
  name: string;
  /** Цвет в формате `#RRGGBBAA`. */
  color: string;
  created_at: string;
  updated_at: string;
}

/** Данные для создания и изменения тега. */
export interface TagInput {
  name: string;
  color: string;
}
