import { getState, setState, type AuthStatus, type User } from "./store/app-store";

const DEFAULT_ERROR_MESSAGES: Record<number, string> = {
  400: "Проверьте введённые данные",
  401: "Нужно войти в аккаунт",
  404: "Ничего не найдено",
  413: "Слишком большой запрос",
};

const SERVER_ERROR_MESSAGE = "Ошибка сервера, попробуйте позже";
const TECHNICAL_ERROR_MESSAGE = "Технические неполадки, попробуйте позже";

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

/** Тип содержимого блока заметки. */
export type BlockType =
  | "text"
  | "heading"
  | "subtitle"
  | "bulleted"
  | "numbered"
  | "checklist"
  | "quote"
  | "file"
  | "image";

/** Содержимое блока заметки. */
export interface BlockContent {
  type: BlockType;
  text: string;
  checked?: boolean;
  attachmentId?: string;
  url?: string;
}

/** Блок заметки с идентификатором. */
export interface NoteBlock {
  id: string;
  content: BlockContent;
}

/** Блок, который клиент отправляет при сохранении заметки. */
export interface BlockInput {
  id?: string;
  content: BlockContent;
}

/** Заметка в формате ответа бэкенда. */
export interface Note {
  id: string;
  parent_note_id?: string | null;
  title: string;
  blocks?: NoteBlock[];
  created_at: string;
  updated_at: string;
}

/** Загруженный файл, прикреплённый к блоку. */
export interface Attachment {
  id: string;
  url: string;
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
  async request<T>(
    path: string,
    options: RequestInit = {},
    messages: Record<number, string> = {}
  ): Promise<T | null> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> | undefined),
    };

    if (options.body && !(options.body instanceof FormData)) {
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
          message = TECHNICAL_ERROR_MESSAGE;
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
   * Записывает пользователя в store как авторизованного.
   *
   * @param profile Профиль из ответа API.
   * @returns Сохранённый профиль.
   */
  private setAuthenticatedUser(profile: User): User {
    setState({
      auth: {
        status: "authenticated",
        isLoggedIn: true,
        user: profile,
      },
    });
    return profile;
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

    return { kind: "session", user: this.setAuthenticatedUser(profile) };
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

    return this.setAuthenticatedUser(profile);
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
  async updateNote(id: string, data: { title: string; blocks: BlockInput[] }): Promise<Note> {
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
   * Загружает профиль текущего пользователя и записывает его в store.
   *
   * @returns Профиль пользователя.
   */
  getProfile(): Promise<User> {
    return this.request<User>("/api/auth/me").then((profile) => {
      if (!profile) {
        throw new ApiError("Профиль не найден", 404);
      }
      return this.setAuthenticatedUser(profile);
    });
  }

  /**
   * Возвращает профиль из локального store без сетевого запроса.
   *
   * @returns Сохранённый профиль или `null`.
   */
  getCachedProfile(): User | null {
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

    return this.setAuthenticatedUser(profile);
  }

  /**
   * Собирает URL аватара для `<img src>`.
   *
   * @param avatar Путь или URL из профиля; `null` — дефолтная картинка.
   * @returns Абсолютный или относительный URL.
   */
  avatarUrl(avatar: string | null): string {
    if (!avatar) {
      return "/assets/images/avatar-default.svg";
    }
    if (avatar.startsWith("http")) {
      return avatar;
    }
    return `${this.baseUrl}${avatar}`;
  }

  /**
   * Запрашивает новый QR для подключения 2FA.
   * Сервер сразу сохраняет новый секрет: предыдущий QR становится недействительным.
   * Адрес нужно освободить через URL.revokeObjectURL, когда картинка больше не нужна.
   *
   * @returns Временный URL PNG 256×256.
   */
  async generateTwoFactorQr(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/auth/2fa/generate`, {
      credentials: "include",
    });

    if (response.status === 401) {
      throw new ApiError("Нужно войти в аккаунт", 401);
    }

    if (response.status === 409) {
      throw new ApiError("Двухфакторная аутентификация уже включена", 409);
    }

    if (!response.ok) {
      throw new ApiError("Не удалось получить QR-код", response.status);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
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
