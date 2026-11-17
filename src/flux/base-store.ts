/** Рекурсивно только для чтения: вложенные объекты тоже нельзя менять снаружи. */
export type ReadonlyState<T> = {
  readonly [Key in keyof T]: T[Key] extends object ? ReadonlyState<T[Key]> : T[Key];
};

/** Подписчик store. Данные читает сам через `getState`. */
type StoreListener = () => void;

/**
 * Хранит состояние и сообщает подписчикам, что оно изменилось.
 * Менять состояние может только наследник, после действия диспетчера.
 */
export abstract class BaseStore<TState extends object> {
  protected state: TState;

  private readonly listeners = new Set<StoreListener>();

  /**
   * @param initialState Состояние до первого действия.
   */
  protected constructor(initialState: TState) {
    this.state = initialState;
  }

  /**
   * Возвращает текущее состояние.
   * Снаружи его менять нельзя: обновление приходит только через действие.
   *
   * @returns Состояние store.
   */
  getState(): ReadonlyState<TState> {
    return this.state as ReadonlyState<TState>;
  }

  /**
   * Подписывает обработчик на обновления состояния.
   *
   * @param listener Функция без аргументов: новое состояние она читает через `getState`.
   * @returns Функция отписки.
   */
  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Сообщает подписчикам, что состояние изменилось. */
  protected emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
