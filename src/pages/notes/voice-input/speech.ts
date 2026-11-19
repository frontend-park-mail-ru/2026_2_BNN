const VOICE_INPUT_LANGUAGE = "ru-RU";

/** Колбэки голосового ввода. */
export interface VoiceInputHandlers {
  /** Получена законченная фраза. */
  onFinal(text: string): void;
  /** Получен промежуточный вариант фразы, пока пользователь говорит. */
  onInterim(text: string): void;
  /** Распознавание остановилось с ошибкой. */
  onError(message: string): void;
  /** Распознавание завершилось. */
  onEnd(): void;
}

/** Запущенный голосовой ввод. */
export interface VoiceInput {
  /** Дослушивает текущую фразу и останавливает запись. */
  stop(): void;
  /** Останавливает запись сразу, без текущей фразы. */
  abort(): void;
}

/** Один вариант распознанной фразы из Web Speech API. */
interface RecognitionAlternative {
  transcript: string;
}

/** Результат распознавания: промежуточный или окончательный. */
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}

/** Событие `result` распознавания речи. В TypeScript DOM его типа нет. */
interface RecognitionResultEvent extends Event {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: RecognitionResult;
  };
}

/** Событие ошибки распознавания речи. */
interface RecognitionErrorEvent extends Event {
  readonly error: string;
}

/** Сессия `SpeechRecognition`, которую браузер отдаёт без типов. */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

/** Конструктор `SpeechRecognition` или `webkitSpeechRecognition`. */
type RecognitionConstructor = new () => Recognition;

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Нет доступа к микрофону. Разрешите его в настройках сайта",
  "service-not-allowed": "Браузер запретил распознавание речи",
  "audio-capture": "Микрофон не найден",
  network: "Для голосового ввода нужен интернет",
  "no-speech": "Ничего не услышали, попробуйте ещё раз",
  "language-not-supported": "Браузер не распознаёт русскую речь",
};

/**
 * Находит конструктор распознавания речи: стандартный или с префиксом `webkit`.
 *
 * @returns Конструктор или `null`, если браузер не поддерживает Web Speech API.
 */
function getRecognitionConstructor(): RecognitionConstructor | null {
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/**
 * Проверяет, доступен ли голосовой ввод в текущем браузере.
 *
 * @returns `true`, если есть SpeechRecognition и страница открыта в безопасном контексте.
 */
export function isSpeechSupported(): boolean {
  return window.isSecureContext && getRecognitionConstructor() !== null;
}

/**
 * Запускает распознавание русской речи. Отдельные английские слова и фразы браузер тоже распознаёт.
 *
 * @param handlers Колбэки для фраз, ошибок и завершения.
 * @returns Управление записью или `null`, если запустить распознавание не удалось.
 */
export function startVoiceInput(handlers: VoiceInputHandlers): VoiceInput | null {
  const Constructor = getRecognitionConstructor();
  if (!Constructor || !window.isSecureContext) {
    return null;
  }

  const recognition = new Constructor();
  recognition.lang = VOICE_INPUT_LANGUAGE;
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) {
        handlers.onFinal(text);
      } else {
        interim += text;
      }
    }
    handlers.onInterim(interim.trim());
  };

  recognition.onerror = (event) => {
    if (event.error === "aborted") {
      return;
    }
    handlers.onError(ERROR_MESSAGES[event.error] ?? "Не удалось распознать речь");
  };

  recognition.onend = () => {
    handlers.onEnd();
  };

  try {
    recognition.start();
  } catch {
    return null;
  }

  return {
    stop: () => recognition.stop(),
    abort: () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.abort();
    },
  };
}
