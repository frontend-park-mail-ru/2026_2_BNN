const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Оставляет только адрес, который можно подставить в `href` или `src`.
 * Относительный путь своего сайта и `https:`. `http:` — только для локального бэкенда.
 * `javascript:` и `data:` не проходят: Handlebars их не экранирует.
 *
 * @param url Адрес из API.
 * @returns Безопасный адрес или пустая строка.
 */
export function safeResourceUrl(url: string): string {
  const value = url.trim();
  if (value.startsWith("/") && !value.startsWith("//") && !/[\s\\]/.test(value)) {
    return value;
  }

  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) {
      return "";
    }
    if (parsed.protocol === "https:") {
      return parsed.href;
    }
    if (parsed.protocol === "http:" && LOCAL_HOSTS.has(parsed.hostname)) {
      return parsed.href;
    }
  } catch {
    return "";
  }

  return "";
}
