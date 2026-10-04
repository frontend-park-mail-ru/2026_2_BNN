import { getState, setState } from "./store/app-store.js";

const LOCAL_API_URL = "http://localhost:5458";

const DEFAULT_ERROR_MESSAGES = {
  400: "Проверьте введённые данные",
  401: "Нужно войти в аккаунт",
  404: "Ничего не найдено",
  413: "Слишком большой запрос",
};

const SERVER_ERROR_MESSAGE = "Ошибка сервера, попробуйте позже";

/**
 * Возвращает базовый URL API:
 * - для localhost используется локальный бэкенд;
 * - для прода — относительные пути текущего хоста.
 *
 * @returns {string}
 */
function getApiUrl() {
  if (window.location.hostname === "localhost") {
    return LOCAL_API_URL;
  }
  return "";
}

/**
 * Подбирает сообщение об ошибке по HTTP-статусу.
 *
 * @param {number} status HTTP-статус ответа.
 * @param {Record<number, string>} messages Локальная карта сообщений конкретного запроса.
 * @returns {string}
 */
function getErrorMessage(status, messages) {
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
  /**
   * @param {string} baseUrl Базовый URL для всех API-запросов.
   */
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  /**
   * Выполняет запрос с единым парсингом JSON и нормализацией ошибок.
   *
   * @param {string} path Путь запроса (без baseUrl).
   * @param {RequestInit} [options={}] Опции fetch.
   * @param {Record<number, string>} [messages={}] Переопределения текстов ошибок по статусам.
   * @returns {Promise<unknown | null>}
   */
  async request(path, options = {}, messages = {}) {
    const headers = { ...options.headers };

    if (options.body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      credentials: "include",
      headers: headers,
    });

    if (!response.ok) {
      const text = await response.text();
      let message = getErrorMessage(response.status, messages);

      if (text) {
        try {
          const data = JSON.parse(text);
          if (data?.message) {
            message = data.message;
          }
        } catch {
          message = text;
        }
      }

      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Сервер вернул некорректный JSON");
    }
  }

  /**
   * Регистрирует пользователя.
   *
   * @param {string} login Логин.
   * @param {string} password Пароль.
   * @returns {Promise<unknown>}
   */
  signUp(login, password) {
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
   * @param {string} login Логин.
   * @param {string} password Пароль.
   * @returns {Promise<unknown>}
   */
  logIn(login, password) {
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
   * @returns {Promise<unknown | null>}
   */
  logOut() {
    return this.request("/api/auth/logout", {
      method: "POST",
    });
  }

  /**
   * Запрашивает список заметок постранично.
   *
   * @param {number} [limit=10] Лимит заметок в запросе.
   * @param {number} [offset=0] Смещение.
   * @returns {Promise<unknown>}
   */
  getNotes(limit = 10, offset = 0) {
    return this.request(`/api/notes/getall?limit=${limit}&offset=${offset}`);
  }

  /**
   * Запрашивает одну заметку по id.
   *
   * @param {string | number} id Идентификатор заметки.
   * @returns {Promise<unknown>}
   */
  getNote(id) {
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
   * Загружает профиль текущего пользователя и синхронизирует auth-состояние в store.
   *
   * @returns {Promise<unknown>}
   */
  getProfile() {
    return this.request("/api/users/me").then((profile) => {
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
   * @returns {unknown | null}
   */
  getCachedProfile() {
    return getState().auth.user;
  }

  /**
   * Сбрасывает данные авторизации в store.
   *
   * @param {"unknown" | "unauthenticated"} [status="unknown"] Целевой auth-статус после сброса.
   * @returns {void}
   */
  clearCachedProfile(status = "unknown") {
    setState({
      auth: {
        status: status,
        isLoggedIn: false,
        user: null,
      },
    });
  }
}

/**
 * Единый экземпляр API-клиента приложения.
 * @type {Api}
 */
export const api = new Api(getApiUrl());
