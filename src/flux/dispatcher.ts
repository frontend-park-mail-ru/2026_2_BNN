/** Действие Flux: тип и полезная нагрузка. */
export interface Action {
  type: string;
}

/** Обработчик, который store регистрирует в диспетчере. */
type ActionHandler<TAction extends Action> = (action: TAction) => void;

/**
 * Раздаёт действия зарегистрированным store по очереди.
 * Повторный `dispatch` из обработчика не начинает вложенный обход, а встаёт в очередь.
 */
export class Dispatcher<TAction extends Action> {
  private readonly handlers = new Set<ActionHandler<TAction>>();
  private readonly queue: TAction[] = [];
  private dispatching = false;

  /**
   * Подписывает store на все действия.
   *
   * @param handler Обработчик. Неизвестные ему действия он пропускает сам.
   * @returns Функция отписки.
   */
  register(handler: ActionHandler<TAction>): () => void {
    this.handlers.add(handler);

    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Ставит действие в очередь и отдаёт его всем stores.
   *
   * @param action Действие с типом и данными.
   */
  dispatch(action: TAction): void {
    this.queue.push(action);
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      while (this.queue.length) {
        const next = this.queue.shift()!;
        for (const handler of this.handlers) handler(next);
      }
    } finally {
      this.queue.length = 0;
      this.dispatching = false;
    }
  }
}
