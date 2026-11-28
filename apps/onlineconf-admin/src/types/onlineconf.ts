export type Scope = "frontend" | "backend" | "auth" | "notes";
export type KeyKind = "config" | "flag";
export type AdminUser = { id: string; login: string };
export type AdminSession = { login: string };
export type FlagEvaluation = {
  result: boolean;
  reason: "disabled" | "excluded" | "included" | "rollout";
  revision: number;
};
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = null | string | number | boolean | JsonObject | JsonValue[];

export type ConfigValue =
  | { value_type: "string"; value: string }
  | { value_type: "number"; value: number }
  | { value_type: "boolean"; value: boolean }
  | { value_type: "object"; value: JsonObject }
  | { value_type: "array"; value: JsonValue[] };

type FlagState = { enabled: boolean; rollout_percent: number };
export type FlagRead = FlagState & { include_users: AdminUser[]; exclude_users: AdminUser[] };
export type FlagWrite = FlagState & { include_user_ids: string[]; exclude_user_ids: string[] };

type KeyData<F> = {
  scope: Scope;
  key: string;
  description: string;
  is_public: boolean;
} & (
  { kind: "config"; config: ConfigValue; flag?: never } | { kind: "flag"; flag: F; config?: never }
);

type KeyMeta = { id: string; version: number; updated_at: string; updated_by: AdminUser };

export type KeyListItem = KeyMeta & KeyData<FlagState>;
export type OnlineconfKey = KeyMeta & KeyData<FlagRead>;
export type CreateKeyInput = KeyData<FlagWrite>;
export type UpdateKeyInput = CreateKeyInput & { version: number };
export type KeyFilters = { query?: string; scope?: Scope; kind?: KeyKind };

export type KeyHistoryEntry = {
  id: string;
  action: string;
  old_value: JsonObject | null;
  new_value: JsonObject | null;
  user: AdminSession;
  created_at: string;
};
