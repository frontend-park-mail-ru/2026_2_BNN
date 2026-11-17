import { startVoiceInput, type VoiceInput } from "./speech";

/** Куда контроллер отдаёт фразы и состояние микрофона. */
interface VoiceInputOptions {
  onFinal(text: string): void;
  onInterim(text: string): void;
  onError(message: string): void;
  onActiveChange(active: boolean): void;
}

/**
 * Держит одну сессию распознавания речи и не даёт запустить вторую поверх неё.
 *
 * @param options Колбэки фраз, ошибок и индикатора записи.
 * @returns Команды включить, дослушать или оборвать запись.
 */
export function createVoiceInputController(options: VoiceInputOptions) {
  let session: VoiceInput | null = null;

  /** Дослушивает текущую фразу и останавливает запись. */
  function stop(): void {
    session?.stop();
  }

  /** Обрывает запись сразу и гасит индикатор микрофона. */
  function abort(): void {
    const current = session;
    session = null;
    current?.abort();
    options.onActiveChange(false);
  }

  /** Включает микрофон или останавливает уже идущую запись. */
  function toggle(): void {
    if (session) {
      stop();
      return;
    }

    const nextSession = startVoiceInput({
      onFinal: options.onFinal,
      onInterim: options.onInterim,
      onError: options.onError,
      onEnd: () => {
        if (session !== nextSession) {
          return;
        }

        session = null;
        options.onActiveChange(false);
      },
    });

    if (!nextSession) {
      options.onActiveChange(false);
      options.onError("Не удалось включить микрофон");
      return;
    }

    session = nextSession;
    options.onActiveChange(true);
  }

  return { toggle, stop, abort };
}
