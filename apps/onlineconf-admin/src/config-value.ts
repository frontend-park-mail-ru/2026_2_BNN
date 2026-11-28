import type { ConfigValue, JsonValue } from "./types";

function finiteJson(value: JsonValue): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteJson);
  return value !== null && typeof value === "object"
    ? Object.values(value).every(finiteJson)
    : true;
}

export function readConfig(type: string, text: string, checked: boolean): ConfigValue {
  if (type === "string") return { value_type: "string", value: text };
  if (type === "boolean") return { value_type: "boolean", value: checked };
  if (type === "number") {
    const value = Number(text);
    if (
      !text.trim() ||
      !Number.isFinite(value) ||
      !/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())
    ) {
      throw new Error("Введите конечное число.");
    }
    return { value_type: "number", value };
  }
  let value: JsonValue;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Введите корректный JSON.");
  }
  if (!finiteJson(value)) throw new Error("JSON содержит слишком большое число.");
  if (type === "array" && Array.isArray(value)) return { value_type: "array", value };
  if (type === "object" && value !== null && typeof value === "object" && !Array.isArray(value)) {
    return { value_type: "object", value };
  }
  throw new Error(type === "array" ? "Ожидается JSON-массив." : "Ожидается JSON-объект.");
}
