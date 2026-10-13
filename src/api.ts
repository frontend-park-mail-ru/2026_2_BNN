import { getState, setState, type AuthStatus } from "./store/app-store.js";

const LOCAL_API_URL = "http://localhost:5458";

const DEFAULT_ERROR_MESSAGES: Record<number, string> = {
  400: "Проверьте введённые данные",
  401: "Нужно войти в аккаунт",
  404: "Ничего не найдено",
  413: "Слишком большой запрос",
};

const SERVER_ERROR_MESSAGE = "Ошибка сервера, попробуйте позже";

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Возвращает базовый URL API:
 * для localhost используется локальный бэкенд, для прода — относительные пути текущего хоста.
 *
 * @returns Базовый URL без завершающего слэша. Пустая строка означает текущий хост.
 */
function getApiUrl(): string {
  if (window.location.hostname === "localhost") {
    return LOCAL_API_URL;
  }
  return "";
}

/**
 * Проверяет, что значение является обычным объектом.
 *
 * @param value Проверяемое значение.
 * @returns `true`, если это объект и не массив.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Подбирает сообщение об ошибке по HTTP-статусу.
 *
 * @param status HTTP-статус ответа.
 * @param messages Локальная карта сообщений конкретного запроса.
 * @returns Текст ошибки для этого статуса.
 */
function getErrorMessage(status: number, messages: Record<number, string>): string {
  return (
    messages[status] ??
    DEFAULT_ERROR_MESSAGES[status] ??
    (status >= 500 ? SERVER_ERROR_MESSAGE : null) ??
    `Ошибка запроса: ${status}`
  );
}

/**
 * HTTP-клиент приложения.
 */
class Api {
  private readonly baseUrl: string;

  /**
   * @param baseUrl Базовый URL для всех API-запросов.
   */
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Выполняет запрос с единым парсингом JSON и нормализацией ошибок.
   *
   * @param path Путь запроса без базового URL.
   * @param options Опции fetch.
   * @param messages Переопределения текстов ошибок по статусам.
   * @returns Разобранный JSON, либо `null` для пустого ответа и статуса 204.
   */
  async request(
    path: string,
    options: RequestInit = {},
    messages: Record<number, string> = {}
  ): Promise<unknown | null> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> | undefined),
    };

    if (options.body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      credentials: "include",
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      let message = getErrorMessage(response.status, messages);

      if (text) {
        try {
          const data: unknown = JSON.parse(text);
          if (isRecord(data) && data.message) {
            message = String(data.message);
          }
        } catch {
          message = text;
        }
      }

      throw new ApiError(message, response.status);
    }

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error("Сервер вернул некорректный JSON");
    }
  }

  /**
   * Регистрирует пользователя.
   *
   * @param login Логин.
   * @param password Пароль.
   * @returns Ответ сервера.
   */
  signUp(login: string, password: string): Promise<unknown | null> {
    return this.request(
      "/api/auth/signup",
      {
        method: "POST",
        body: JSON.stringify({ login, password }),
      },
      {
        400: "Логин 3–20 символов, пароль 8–128 символов",
        409: "Такой логин уже занят",
      }
    );
  }

  /**
   * Авторизует пользователя.
   *
   * @param login Логин.
   * @param password Пароль.
   * @returns Ответ сервера.
   */
  logIn(login: string, password: string): Promise<unknown | null> {
    return this.request(
      "/api/auth/signin",
      {
        method: "POST",
        body: JSON.stringify({ login, password }),
      },
      {
        401: "Неверный логин или пароль",
      }
    );
  }

  /**
   * Завершает пользовательскую сессию на бэкенде.
   *
   * @returns Ответ сервера или `null`, если тела нет.
   */
  logOut(): Promise<unknown | null> {
    return this.request("/api/auth/logout", {
      method: "POST",
    });
  }

  /**
   * Запрашивает список заметок постранично.
   *
   * @param limit Лимит заметок в запросе.
   * @param offset Смещение.
   * @returns Список заметок в формате ответа сервера.
   */
  getNotes(limit = 10, offset = 0): Promise<unknown | null> {
    return this.request(`/api/notes/getall?limit=${limit}&offset=${offset}`);
  }

  /**
   * Запрашивает одну заметку по id.
   *
   * @param id Идентификатор заметки.
   * @returns Заметка в формате ответа сервера.
   */
  getNote(id: string | number): Promise<unknown | null> {
    return this.request(
      `/api/notes/${encodeURIComponent(id)}`,
      {},
      {
        400: "Некорректный адрес заметки",
        404: "Заметка не найдена",
      }
    );
  }

  /**
   * Загружает профиль текущего пользователя и записывает его в store.
   *
   * @returns Профиль пользователя.
   */
  getProfile(): Promise<unknown | null> {
    return this.request("/api/auth/me").then((profile) => {
      setState({
        auth: {
          status: "authenticated",
          isLoggedIn: true,
          user: profile,
        },
      });
      return profile;
    });
  }

  /**
   * Возвращает профиль из локального store без сетевого запроса.
   *
   * @returns Сохранённый профиль или `null`.
   */
  getCachedProfile(): unknown {
    return getState().auth.user;
  }

  /**
   * Сбрасывает данные авторизации в store.
   *
   * @param status Целевой auth-статус после сброса.
   */
  clearCachedProfile(status: Extract<AuthStatus, "unknown" | "unauthenticated"> = "unknown"): void {
    setState({
      auth: {
        status,
        isLoggedIn: false,
        user: null,
      },
    });
  }
}

/**
 * Единый экземпляр API-клиента приложения.
 */
export const api = new Api(getApiUrl());
