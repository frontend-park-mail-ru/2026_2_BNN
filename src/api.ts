import type { User } from "@/types/user";
import type { BlockInput, Note } from "@/types/note";
import type { Tag, TagInput } from "@/types/tag";
import type { Attachment } from "@/types/attachment";
import { safeResourceUrl } from "@/utils/url";

const DEFAULT_ERROR_MESSAGES: Record<number, string> = {
  400: "Проверьте введённые данные",
  401: "Нужно войти в аккаунт",
  404: "Ничего не найдено",
  413: "Слишком большой запрос",
};

/** Запросы, где 401 означает неверные данные входа, а не истёкшую сессию. */
const NO_REFRESH_PATHS = [
  "/api/auth/signin",
  "/api/auth/signup",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/auth/2fa/verify",
];

const SERVER_ERROR_MESSAGE = "Ошибка сервера, попробуйте позже";
const TECHNICAL_ERROR_MESSAGE = "Технические неполадки, попробуйте позже";
const CSRF_COOKIE = "bnn_csrf";
const CSRF_HEADER = "X-CSRF-Token";
const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE"]);

/**
 * Читает куку, которую бэкенд отдаёт не как HttpOnly, чтобы её можно было вернуть в заголовке.
 *
 * @param name Имя куки.
 * @returns Значение или пустая строка.
 */
function readCookie(name: string): string {
  const cookies = document.cookie ? document.cookie.split("; ") : [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator === -1 || cookie.slice(0, separator) !== name) {
      continue;
    }
    const value = cookie.slice(separator + 1);
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return "";
}

/**
 * Добавляет `X-CSRF-Token` из куки `bnn_csrf` к изменяющему запросу.
 * Кука читается заново при каждом вызове: после refresh она может смениться.
 *
 * @param method Метод запроса.
 * @param headers Уже собранные заголовки.
 * @returns Заголовки с CSRF-токеном для POST, PUT и DELETE.
 */
function withCsrf(method: string, headers: Record<string, string>): Record<string, string> {
  if (!MUTATING_METHODS.has(method.toUpperCase())) {
    return headers;
  }
  const token = readCookie(CSRF_COOKIE);
  if (!token) {
    return headers;
  }
  return { ...headers, [CSRF_HEADER]: token };
}

/** Ошибка HTTP-запроса с кодом ответа сервера. */
export class ApiError extends Error {
  /** HTTP-статус ответа. */
  status: number;

  /**
   * @param message Сообщение для пользователя или лога.
   * @param status HTTP-статус ответа.
   */
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Запрос не дошёл до сервера: fetch упал или service worker ответил офлайн-заглушкой 503.
 *
 * @param error Пойманная ошибка.
 * @returns `true`, если это потеря соединения, а не ответ бэкенда.
 */
export function isOfflineError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof ApiError && error.status === 503);
}

/**
 * Возвращает базовый URL API.
 * Запросы идут на текущий хост: локально Vite проксирует `/api` на бэкенд,
 * в проде API доступен на том же хосте.
 *
 * @returns Пустая строка: пути запросов относительные.
 */
function getApiUrl(): string {
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
  private refreshing: Promise<boolean> | null = null;

  /**
   * @param baseUrl Базовый URL для всех API-запросов.
   */
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Обновляет куку `bnn_access` по `bnn_refresh`. Параллельные запросы ждут одно обновление:
   * старый refresh после использования больше не работает.
   *
   * @returns `true`, если сессию удалось продлить.
   */
  private refreshSession(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: withCsrf("POST", {}),
      })
        .then((response) => response.ok)
        .catch(() => false)
        .finally(() => {
          this.refreshing = null;
        });
    }
    return this.refreshing;
  }

  /**
   * Отправляет запрос, при необходимости обновляет сессию
   * и возвращает успешный ответ с ещё не прочитанным телом.
   */
  private async requestResponse(
    path: string,
    options: RequestInit = {},
    messages: Record<number, string> = {}
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> | undefined),
    };

    if (options.body && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const method = (options.method ?? "GET").toUpperCase();

    const send = (): Promise<Response> =>
      fetch(`${this.baseUrl}${path}`, {
        ...options,
        credentials: "include",
        headers: withCsrf(method, headers),
      });

    let response = await send();

    if (response.status === 401 && !NO_REFRESH_PATHS.some((item) => path.startsWith(item))) {
      if (await this.refreshSession()) {
        response = await send();
      }
    }

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
          message = TECHNICAL_ERROR_MESSAGE;
        }
      }

      throw new ApiError(message, response.status);
    }

    return response;
  }

  /** Читает успешный ответ как JSON. Для пустого ответа возвращает null. */
  async request<T>(
    path: string,
    options: RequestInit = {},
    messages: Record<number, string> = {}
  ): Promise<T | null> {
    const response = await this.requestResponse(path, options, messages);

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text) as T;
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
  async signUp(login: string, password: string): Promise<void> {
    await this.request(
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
   * Авторизует пользователя паролем.
   *
   * @param login Логин.
   * @param password Пароль.
   * @returns Полная сессия (200) или ожидание кода 2FA (202, кука `bnn_2fa`).
   */
  async logIn(
    login: string,
    password: string
  ): Promise<{ kind: "session"; user: User } | { kind: "twoFactor" }> {
    const response = await fetch(`${this.baseUrl}/api/auth/signin`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password }),
    });

    if (response.status === 202) {
      return { kind: "twoFactor" };
    }

    if (!response.ok) {
      const messages: Record<number, string> = {
        401: "Неверный логин или пароль",
        403: "Этот аккаунт создан через GitHub. Войдите через GitHub",
      };
      const text = await response.text();
      let message = getErrorMessage(response.status, messages);
      if (text) {
        try {
          const data: unknown = JSON.parse(text);
          if (isRecord(data) && data.message) {
            message = String(data.message);
          }
        } catch {
          if (/oauth/i.test(text)) {
            message = messages[403];
          }
        }
      }
      throw new ApiError(message, response.status);
    }

    const text = await response.text();
    if (!text) {
      throw new ApiError("Сервер не вернул профиль", 500);
    }

    let profile: User;
    try {
      profile = JSON.parse(text) as User;
    } catch {
      throw new Error("Сервер вернул некорректный JSON");
    }

    return { kind: "session", user: profile };
  }

  /**
   * Завершает вход после signin/OAuth при включённой 2FA (кука `bnn_2fa`).
   *
   * @param code Шесть цифр из TOTP-приложения.
   * @returns Профиль и полная сессия.
   */
  async verifyTwoFactor(code: string): Promise<User> {
    const profile = await this.request<User>(
      "/api/auth/2fa/verify",
      {
        method: "POST",
        body: JSON.stringify({ code }),
      },
      {
        401: "Время истекло — войдите снова",
        403: "Неверный код",
      }
    );

    if (!profile) {
      throw new ApiError("Профиль не найден", 500);
    }

    return profile;
  }

  /**
   * Завершает пользовательскую сессию на бэкенде.
   *
   * @returns Ответ сервера или `null`, если тела нет.
   */
  async logOut(): Promise<void> {
    await this.request("/api/auth/logout", {
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
  async getNotes(limit = 10, offset = 0): Promise<Note[]> {
    const notes = await this.request<Note[]>(`/api/notes/all?limit=${limit}&offset=${offset}`);
    return notes ?? [];
  }

  async getFavorites(): Promise<Note[]> {
    return (await this.request<Note[]>("/api/notes/favorites")) ?? [];
  }

  async setFavorite(id: string, favorite: boolean): Promise<void> {
    await this.request(`/api/notes/${encodeURIComponent(id)}/favorite`, {
      method: favorite ? "POST" : "DELETE",
    });
  }

  /**
   * Отправляет запрос на создание новой заметки.
   *
   * @param input Начальные данные заметки - название и идентификатор родительской заметки.
   * @returns Созданная заметка в формате ответа сервера.
   */
  async createNote(input: { title?: string; parent_note_id?: string } = {}): Promise<Note> {
    const note = await this.request<Note>("/api/notes", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (!note) {
      throw new ApiError("Не удалось создать заметку", 500);
    }
    return note;
  }

  /**
   * Отправляет обновлённую версию заметки.
   *
   * @param id Идентификатор заметки.
   * @param data Содержимое заметки.
   * @returns Заметка в формате ответа сервера.
   */
  async updateNote(
    id: string,
    data: { title: string; blocks: BlockInput[]; tag_ids?: string[] }
  ): Promise<Note> {
    const note = await this.request<Note>(`/api/notes/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    if (!note) {
      throw new ApiError("Заметка не найдена", 404);
    }
    return note;
  }
  /**
   * Запрашивает одну заметку по id.
   *
   * @param id Идентификатор заметки.
   * @returns Заметка в формате ответа сервера.
   */
  async getNote(id: string | number): Promise<Note> {
    const note = await this.request<Note>(
      `/api/notes/${encodeURIComponent(id)}`,
      {},
      {
        400: "Некорректный адрес заметки",
        404: "Заметка не найдена",
      }
    );
    if (!note) {
      throw new ApiError("Заметка не найдена", 404);
    }
    return note;
  }

  /**
   * Удаляет заметку.
   *
   * @param id Идентификатор заметки.
   */
  async deleteNote(id: string): Promise<void> {
    await this.request(`/api/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  /**
   * Загружает файл в блок заметки.
   *
   * @param blockId Идентификатор блока.
   * @param file Файл вложения.
   * @returns Метаданные загруженного файла.
   */
  async uploadAttachment(blockId: string, file: File): Promise<Attachment> {
    const body = new FormData();
    body.append("file", file);

    const attachment = await this.request<Attachment>(
      `/api/blocks/${encodeURIComponent(blockId)}/attachments`,
      { method: "POST", body },
      {
        413: "Файл больше 10 МБ",
        415: "Можно загрузить только JPEG, PNG, WebP, GIF или PDF",
      }
    );
    if (!attachment) {
      throw new ApiError("Не удалось загрузить файл", 500);
    }
    return attachment;
  }

  /**
   * Удаляет вложение.
   *
   * @param id Идентификатор вложения.
   */
  async deleteAttachment(id: string): Promise<void> {
    await this.request(`/api/attachments/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  /**
   * Запрашивает теги пользователя, отсортированные по названию.
   *
   * @returns Список тегов.
   */
  async getTags(): Promise<Tag[]> {
    const tags = await this.request<Tag[]>("/api/tags");
    return tags ?? [];
  }

  /**
   * Создаёт тег.
   *
   * @param input Название и цвет.
   * @returns Созданный тег.
   */
  async createTag(input: TagInput): Promise<Tag> {
    const tag = await this.request<Tag>(
      "/api/tags",
      { method: "POST", body: JSON.stringify(input) },
      { 400: "Название от 1 до 30 символов", 409: "Тег с таким названием уже есть" }
    );
    if (!tag) {
      throw new ApiError("Не удалось создать тег", 500);
    }
    return tag;
  }

  /**
   * Меняет название и цвет тега.
   *
   * @param id Идентификатор тега.
   * @param input Новые название и цвет.
   * @returns Обновлённый тег.
   */
  async updateTag(id: string, input: TagInput): Promise<Tag> {
    const tag = await this.request<Tag>(
      `/api/tags/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(input) },
      {
        400: "Название от 1 до 30 символов",
        404: "Тег не найден",
        409: "Тег с таким названием уже есть",
      }
    );
    if (!tag) {
      throw new ApiError("Тег не найден", 404);
    }
    return tag;
  }

  /**
   * Удаляет тег и снимает его со всех заметок.
   *
   * @param id Идентификатор тега.
   */
  async deleteTag(id: string): Promise<void> {
    await this.request(
      `/api/tags/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      { 404: "Тег не найден" }
    );
  }

  /**
   * Загружает профиль текущего пользователя и записывает его в store.
   *
   * @returns Профиль пользователя.
   */
  getProfile(): Promise<User> {
    return this.request<User>("/api/auth/me").then((profile) => {
      if (!profile) {
        throw new ApiError("Профиль не найден", 404);
      }
      return profile;
    });
  }

  /**
   * Меняет пароль текущего пользователя.
   *
   * @param oldPassword Текущий пароль.
   * @param newPassword Новый пароль.
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await this.request(
      "/api/auth/password",
      {
        method: "PUT",
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
        }),
      },
      {
        400: "Смена пароля недоступна для этого аккаунта",
        403: "Неверный старый пароль",
        413: "Тело запроса больше 4096 байт",
      }
    );
  }

  /**
   * Загружает аватар и обновляет профиль в store.
   *
   * @param file Файл изображения (JPEG, PNG или WebP).
   * @returns Обновлённый профиль.
   */
  async updateAvatar(file: File): Promise<User> {
    const body = new FormData();
    body.append("avatar", file);

    const profile = await this.request<User>(
      "/api/auth/avatar",
      {
        method: "PUT",
        body,
      },
      {
        400: "Нет файла в поле avatar",
        413: "Файл больше 5 МБ",
        415: "Формат не jpeg, png или webp",
      }
    );

    if (!profile) {
      throw new ApiError("Профиль не найден", 404);
    }

    return profile;
  }

  /**
   * Собирает URL аватара для `<img src>`.
   *
   * @param avatar Путь или URL из профиля; `null` — дефолтная картинка.
   * @returns Абсолютный или относительный URL.
   */
  avatarUrl(avatar: string | null): string {
    if (!avatar) {
      return "";
    }
    const url = avatar.startsWith("http") ? avatar : `${this.baseUrl}${avatar}`;
    return safeResourceUrl(url);
  }

  /**
   * Запрашивает новый QR для подключения 2FA.
   * Сервер сразу сохраняет новый секрет: предыдущий QR становится недействительным.
   * Адрес нужно освободить через URL.revokeObjectURL, когда картинка больше не нужна.
   *
   * @returns Временный URL PNG 256×256.
   */
  async generateTwoFactorQr(): Promise<string> {
    const response = await this.requestResponse(
      "/api/auth/2fa/generate",
      {},
      { 409: "Двухфакторная аутентификация уже включена" }
    );

    const image = await response.blob();
    return URL.createObjectURL(image);
  }

  /**
   * Подтверждает код из приложения и включает 2FA.
   *
   * @param code Шесть цифр из TOTP-приложения.
   * @returns Профиль с is_2fa_enabled: true.
   */
  async enableTwoFactor(code: string): Promise<User> {
    await this.request(
      "/api/auth/2fa/enable",
      {
        method: "POST",
        body: JSON.stringify({ code }),
      },
      {
        400: "Сначала запросите QR-код",
        401: "Нужно войти в аккаунт",
        403: "Неверный код",
      }
    );

    return this.getProfile();
  }

  /**
   * Отключает 2FA кодом из приложения.
   *
   * @param code Шесть цифр из TOTP-приложения.
   * @returns Профиль с is_2fa_enabled: false.
   */
  async disableTwoFactor(code: string): Promise<User> {
    await this.request(
      "/api/auth/2fa/disable",
      {
        method: "POST",
        body: JSON.stringify({ code }),
      },
      {
        401: "Нужно войти в аккаунт",
        403: "Неверный код",
      }
    );

    return this.getProfile();
  }
}

/**
 * Единый экземпляр API-клиента приложения.
 */
export const api = new Api(getApiUrl());
