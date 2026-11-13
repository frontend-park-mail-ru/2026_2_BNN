const STORAGE_KEY = "dictation-language";

/** Язык голосового ввода. */
export interface DictationLanguage {
  /** Код языка для SpeechRecognition, например `ru-RU`. */
  code: string;
  /** Короткая подпись на кнопке переключения. */
  label: string;
}

/** Колбэки голосового ввода. */
export interface DictationHandlers {
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
export interface Dictation {
  /** Дослушивает текущую фразу и останавливает запись. */
  stop(): void;
  /** Останавливает запись сразу, без текущей фразы. */
  abort(): void;
}

interface RecognitionAlternative {
  transcript: string;
}

interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}

interface RecognitionResultEvent extends Event {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: RecognitionResult;
  };
}

interface RecognitionErrorEvent extends Event {
  readonly error: string;
}

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

type RecognitionConstructor = new () => Recognition;

/** Языки, между которыми переключается голосовой ввод. */
export const DICTATION_LANGUAGES: DictationLanguage[] = [
  { code: "ru-RU", label: "RU" },
  { code: "en-US", label: "EN" },
];

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Нет доступа к микрофону. Разрешите его в настройках сайта",
  "service-not-allowed": "Браузер запретил распознавание речи",
  "audio-capture": "Микрофон не найден",
  network: "Для голосового ввода нужен интернет",
  "no-speech": "Ничего не услышали, попробуйте ещё раз",
  "language-not-supported": "Браузер не распознаёт этот язык",
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
 * Читает сохранённый язык голосового ввода из localStorage.
 *
 * @returns Код языка или `null`.
 */
function readStoredLanguage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Подбирает язык по настройкам браузера.
 *
 * @returns Первый язык браузера из списка поддерживаемых или русский.
 */
function getBrowserLanguage(): DictationLanguage {
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];

  for (const code of preferred) {
    const prefix = code.toLowerCase().split("-")[0];
    const language = DICTATION_LANGUAGES.find((item) => item.code.toLowerCase().startsWith(prefix));
    if (language) {
      return language;
    }
  }

  return DICTATION_LANGUAGES[0];
}

/**
 * Возвращает текущий язык голосового ввода.
 *
 * @returns Сохранённый язык или язык браузера.
 */
export function getDictationLanguage(): DictationLanguage {
  const stored = readStoredLanguage();
  return DICTATION_LANGUAGES.find((item) => item.code === stored) ?? getBrowserLanguage();
}

/**
 * Переключает язык голосового ввода на следующий из списка и сохраняет выбор.
 *
 * @returns Новый язык.
 */
export function switchDictationLanguage(): DictationLanguage {
  const current = DICTATION_LANGUAGES.indexOf(getDictationLanguage());
  const next = DICTATION_LANGUAGES[(current + 1) % DICTATION_LANGUAGES.length];

  try {
    localStorage.setItem(STORAGE_KEY, next.code);
  } catch {
    return next;
  }

  return next;
}

/**
 * Запускает распознавание речи.
 *
 * @param language Язык, на котором говорит пользователь.
 * @param handlers Колбэки для фраз, ошибок и завершения.
 * @returns Управление записью или `null`, если запустить распознавание не удалось.
 */
export function startDictation(
  language: DictationLanguage,
  handlers: DictationHandlers
): Dictation | null {
  const Constructor = getRecognitionConstructor();
  if (!Constructor || !window.isSecureContext) {
    return null;
  }

  const recognition = new Constructor();
  recognition.lang = language.code;
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
