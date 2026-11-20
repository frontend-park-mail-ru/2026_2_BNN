/** Последовательно сохраняет изменения редактора после паузы во вводе. */
export function createAutosave(options: {
  delay: number;
  save: () => Promise<boolean>;
  onPending: () => void;
  onFailure: () => void;
  canSchedule: () => boolean;
}) {
  let timer: number | undefined;
  let pending = false;
  let saving: Promise<void> | null = null;
  let lastFailed = false;
  let version = 0;

  /** Ставит сохранение через паузу после последнего изменения. */
  function schedule(): void {
    if (!options.canSchedule()) return;
    pending = true;
    options.onPending();
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void run(), options.delay);
  }

  /**
   * Запускает сохранение, если есть несохранённые правки.
   * Пока предыдущий запрос не закончился, повторный вызов ждёт его.
   *
   * @returns Текущий или уже идущий запрос.
   */
  function run(): Promise<void> {
    if (saving) return saving;
    if (!pending) return Promise.resolve();

    window.clearTimeout(timer);
    timer = undefined;
    pending = false;
    const requestVersion = version;
    saving = Promise.resolve()
      .then(() => options.save())
      .then(
        (succeeded) => {
          if (requestVersion !== version) return;
          lastFailed = !succeeded;
          if (!succeeded) pending = true;
          else if (pending && options.canSchedule()) schedule();
        },
        () => {
          if (requestVersion !== version) return;
          lastFailed = true;
          pending = true;
          options.onFailure();
        }
      )
      .finally(() => {
        saving = null;
      });
    return saving;
  }

  /**
   * Сохраняет всё, что ещё не ушло на сервер. Нужно перед уходом со страницы.
   *
   * @returns `false`, если последняя попытка не удалась.
   */
  async function flush(): Promise<boolean> {
    if (saving) {
      await saving;
      if (lastFailed) return false;
    }
    window.clearTimeout(timer);
    timer = undefined;
    while (pending) {
      await run();
      if (lastFailed) break;
    }
    return !pending;
  }

  /** Отменяет запланированное сохранение и забывает накопленные правки. */
  function clear(): void {
    version += 1;
    window.clearTimeout(timer);
    timer = undefined;
    pending = false;
    lastFailed = false;
  }

  return {
    schedule,
    run,
    flush,
    clear,
    hasPending: () => pending,
    isSaving: () => saving !== null,
  };
}
