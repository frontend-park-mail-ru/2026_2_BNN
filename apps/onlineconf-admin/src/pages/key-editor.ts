import { ApiError, createKey, deleteKey, getKey, getScopes, listKeys, updateKey } from "../api/api";
import { mountFlagEditor } from "../components/flag-editor";
import { readConfig } from "../utils/config-value";
import template from "../templates/key-editor.hbs";
import type { CreateKeyInput, OnlineconfKey, Scope } from "../types/onlineconf";

/** Подключает создание и редактирование ключа и управляет жизненным циклом формы. */
export function mountKeyEditor(
  main: HTMLElement,
  id: string | undefined,
  onAccessError: (error: ApiError) => void,
  navigate: (path: string, replace?: boolean) => void,
  onDraftChange?: (name: string, scope: Scope) => void
): { destroy: () => void; canLeave: () => boolean } {
  main.innerHTML = template({
    title: id ? "Карточка ключа" : "Создание ключа",
    historyHref: id ? `/onlineconf/keys/${encodeURIComponent(id)}/history` : undefined,
  });
  const find = <T extends HTMLElement>(selector: string) => main.querySelector<T>(selector)!;
  const form = find<HTMLFormElement>("[data-key-form]");
  const field = <T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    name: string
  ) => form.elements.namedItem(name) as T;
  const scope = field<HTMLSelectElement>("scope");
  const name = field<HTMLInputElement>("key");
  const kind = field<HTMLSelectElement>("kind");
  const description = field<HTMLTextAreaElement>("description");
  const isPublic = field<HTMLInputElement>("is_public");
  const valueType = field<HTMLSelectElement>("value_type");
  const value = field<HTMLTextAreaElement>("value");
  const booleanValue = field<HTMLInputElement>("boolean_value");
  const status = find("[data-key-status]");
  const fields = find<HTMLFieldSetElement>("[data-key-fields]");
  const loadButton = find<HTMLButtonElement>("[data-key-load]");
  const reloadButton = find<HTMLButtonElement>("[data-key-reload]");
  const saveButton = find<HTMLButtonElement>("[data-key-save]");
  const deleteButton = find<HTMLButtonElement>("[data-key-delete]");
  const identityError = find("#key-identity-error");
  const valueError = find("#key-value-error");
  const events = new AbortController();
  let request: AbortController | undefined;
  let saved: OnlineconfKey | undefined;
  let scopes: Scope[] = [];
  let dirty = false;
  let flagDirty = false;
  let flagEditor: ReturnType<typeof mountFlagEditor> | undefined;
  let busy = false;
  let written = false;
  let baseline = "";
  let pendingInput: CreateKeyInput | undefined;
  let errorFocus: HTMLElement | undefined;

  /** Снимает состояние общих полей и конфига для сравнения с сохранёнными данными. */
  function snapshot(): string {
    return JSON.stringify([
      scope.value,
      name.value,
      kind.value,
      description.value,
      isPublic.checked,
      valueType.value,
      value.value,
      booleanValue.checked,
    ]);
  }

  /** Запрашивает подтверждение ухода, если на экране есть черновик. */
  function canLeave(): boolean {
    if (busy)
      return window.confirm(
        "Запрос ещё выполняется. Покинуть карточку? Результат операции проверьте в каталоге."
      );
    return !dirty || window.confirm("Есть несохранённые изменения. Покинуть карточку?");
  }
  function updateControls(): void {
    fields.disabled = busy;
    scope.disabled = Boolean(saved) || written;
    name.readOnly = Boolean(saved) || written;
    kind.disabled = Boolean(saved) || written;
    saveButton.disabled = written;
    flagEditor?.setDisabled(busy || written);
    deleteButton.disabled = written;
    reloadButton.disabled = busy;
    loadButton.disabled = busy;
    form.setAttribute("aria-busy", String(busy));
  }
  function clearErrors(): void {
    for (const error of form.querySelectorAll(".key-editor__error")) error.textContent = "";
    for (const control of form.querySelectorAll("[aria-invalid]"))
      control.removeAttribute("aria-invalid");
  }
  function markError(control: HTMLElement, error: HTMLElement, message: string): void {
    error.textContent = message;
    control.setAttribute("aria-invalid", "true");
    errorFocus = control;
  }
  name.addEventListener(
    "invalid",
    () => {
      identityError.textContent =
        "Имя: от 1 до 100 символов, латинская буква в начале; далее буквы, цифры, _, . и -.";
      name.setAttribute("aria-invalid", "true");
    },
    { signal: events.signal }
  );
  function showValue(): void {
    const boolean = valueType.value === "boolean";
    value.hidden = boolean;
    find("[data-value-label]").hidden = boolean;
    find("[data-boolean-field]").hidden = !boolean;
    find("[data-format-json]").hidden = !["object", "array"].includes(valueType.value);
    valueError.textContent = "";
    value.removeAttribute("aria-invalid");
    valueType.removeAttribute("aria-invalid");
    booleanValue.removeAttribute("aria-invalid");
  }
  function showKind(): void {
    flagEditor?.destroy();
    flagEditor = undefined;
    const flag = kind.value === "flag";
    find("[data-config-fields]").hidden = flag;
    const flagHost = find("[data-flag-editor]");
    flagHost.hidden = !flag;
    if (flag)
      flagEditor = mountFlagEditor(flagHost, {
        onAccessError,
        initial: saved?.kind === "flag" ? saved.flag : undefined,
        onChange: () => {
          flagDirty = true;
          dirty = true;
        },
      });
    value.disabled = flag;
    valueType.disabled = flag;
    booleanValue.disabled = flag;
  }

  /** Заполняет форму сохранёнными данными и сбрасывает признаки изменений. */
  function populate(): void {
    scope.replaceChildren(...scopes.map((item) => new Option(item, item)));
    scope.value = saved?.scope ?? scopes[0] ?? "";
    name.value = saved?.key ?? "";
    onDraftChange?.(name.value, scope.value as Scope);
    kind.value = saved?.kind ?? "config";
    description.value = saved?.description ?? "";
    isPublic.checked = saved?.is_public ?? false;
    const config = saved?.kind === "config" ? saved.config : undefined;
    valueType.value = config?.value_type ?? "string";
    value.value = config
      ? typeof config.value === "string"
        ? config.value
        : JSON.stringify(config.value, null, 2)
      : "";
    booleanValue.checked = config?.value === true;
    showKind();
    find("[data-key-meta]").textContent = saved
      ? `ID: ${saved.id} · Версия: ${saved.version} · ${saved.updated_at} · ${saved.updated_by.login}`
      : "";
    deleteButton.hidden = !saved;
    clearErrors();
    showValue();
    form.hidden = false;
    baseline = snapshot();
    dirty = false;
    flagDirty = false;
    updateControls();
  }
  function showError(error: unknown, timedOut: boolean): void {
    if (error instanceof ApiError && (error.status === 401 || error.code === "NOT_FOUND")) {
      onAccessError(error);
      return;
    }
    if (error instanceof ApiError && error.code === "VERSION_CONFLICT") {
      status.textContent =
        "Ключ изменился на сервере. Черновик сохранён. Загрузите актуальную версию перед повторным сохранением или удалением.";
      written = true;
      reloadButton.hidden = false;
    } else if (error instanceof ApiError && error.code === "KEY_EXISTS") {
      identityError.textContent = "В этой области уже есть ключ с таким именем.";
      name.setAttribute("aria-invalid", "true");
      scope.setAttribute("aria-invalid", "true");
      status.textContent = "Проверьте имя и область. Черновик сохранён.";
      errorFocus = name;
    } else {
      if (error instanceof ApiError && error.code === "VALIDATION") {
        const message = error.message;
        if (/\b(key|scope)\b/i.test(message)) {
          markError(
            /\bscope\b/i.test(message) && !scope.disabled ? scope : name,
            identityError,
            message
          );
        } else if (/\b(config|value|value_type)\b/i.test(message)) {
          const target = /\bvalue_type\b/i.test(message)
            ? valueType
            : value.hidden
              ? booleanValue
              : value;
          markError(target, valueError, message);
        } else if (/\bdescription\b/i.test(message)) {
          markError(description, find("#key-description-error"), message);
        } else if (/\bis_public\b/i.test(message)) {
          markError(isPublic, find("#key-public-error"), message);
        } else {
          errorFocus = flagEditor?.showError(message);
        }
      }
      status.textContent = timedOut
        ? "Сервер не ответил вовремя. Черновик сохранён. Если выполнялась запись, проверьте результат в каталоге."
        : error instanceof ApiError && error.code === "VALIDATION"
          ? error.message
          : "Не удалось выполнить запрос. Черновик сохранён. Попробуйте ещё раз.";
    }
  }
  function focusError(): void {
    errorFocus?.focus();
    errorFocus = undefined;
  }

  /** Выполняет одну операцию карточки с блокировкой формы и таймаутом. */
  async function run(action: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    errorFocus = undefined;
    const current = new AbortController();
    request = current;
    const timer = window.setTimeout(() => current.abort(), 10_000);
    updateControls();
    try {
      await action(current.signal);
    } catch (error) {
      if (events.signal.aborted || request !== current) return;
      if (written && pendingInput) {
        status.textContent =
          "Запись принята, но актуальная карточка не загружена. Черновик сохранён. Повторите загрузку; повторная запись заблокирована.";
        reloadButton.hidden = false;
      }
      if (
        !written ||
        !pendingInput ||
        (error instanceof ApiError && (error.status === 401 || error.code === "NOT_FOUND"))
      )
        showError(error, current.signal.aborted);
    } finally {
      clearTimeout(timer);
      if (!events.signal.aborted && request === current) {
        busy = false;
        updateControls();
        focusError();
      }
    }
  }

  /** Ищет созданный ключ по точному имени и области, если сервер не вернул ID. */
  async function resolveCreated(signal: AbortSignal): Promise<string> {
    if (id) return id;
    if (!pendingInput) throw new Error("No pending creation");
    const keys = await listKeys(
      { scope: pendingInput.scope, query: pendingInput.key, kind: pendingInput.kind },
      signal
    );
    const exact = keys.filter(
      (key) =>
        key.scope === pendingInput!.scope &&
        key.key === pendingInput!.key &&
        key.kind === pendingInput!.kind
    );
    if (exact.length !== 1) throw new Error("Created key not found");
    return exact[0].id;
  }

  /** Перечитывает карточку после принятой сервером записи. */
  async function readBack(signal: AbortSignal): Promise<void> {
    const target = await resolveCreated(signal);
    const key = await getKey(target, signal);
    if (events.signal.aborted) return;
    if (!id) {
      dirty = false;
      busy = false;
      navigate(`/onlineconf/keys/${key.id}`, true);
      return;
    }
    saved = key;
    written = false;
    pendingInput = undefined;
    reloadButton.hidden = true;
    populate();
    status.textContent = "Сохранено. Загружена актуальная версия.";
  }

  /** Загружает доступные области и полную карточку существующего ключа. */
  function load(): void {
    void run(async (signal) => {
      status.textContent = "Загружаем карточку…";
      loadButton.hidden = true;
      try {
        const [available, key] = await Promise.all([
          getScopes(signal),
          id ? getKey(id, signal) : Promise.resolve(undefined),
        ]);
        if (events.signal.aborted) return;
        scopes = available;
        if (!scopes.length || (key && !scopes.includes(key.scope)))
          throw new Error("Invalid scopes");
        saved = key;
        populate();
        status.textContent = "";
      } catch (error) {
        loadButton.hidden = false;
        throw error;
      }
    });
  }

  /** Отмечает изменения общих полей, конфига или флага. */
  function updateDirty(): void {
    dirty = flagDirty || snapshot() !== baseline;
  }

  form.addEventListener("input", updateDirty, { signal: events.signal });
  name.addEventListener("input", () => onDraftChange?.(name.value, scope.value as Scope), {
    signal: events.signal,
  });
  scope.addEventListener("change", () => onDraftChange?.(name.value, scope.value as Scope), {
    signal: events.signal,
  });
  form.addEventListener("change", updateDirty, { signal: events.signal });
  kind.addEventListener("change", showKind, { signal: events.signal });
  valueType.addEventListener("change", showValue, { signal: events.signal });

  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      if (busy || written || form.hidden) return;
      clearErrors();
      if (!form.reportValidity()) return;
      if (!scopes.includes(scope.value as Scope)) return;
      let input: CreateKeyInput;
      const common = {
        scope: scope.value as Scope,
        key: name.value,
        description: description.value,
        is_public: isPublic.checked,
      };
      if (kind.value === "flag") {
        const flag = flagEditor?.read();
        if (!flag) return;
        input = { ...common, kind: "flag", flag };
      } else {
        let config;
        try {
          config = readConfig(valueType.value, value.value, booleanValue.checked);
          if (
            scope.value === "backend" &&
            name.value === "attachments.max_file_size_bytes" &&
            (config.value_type !== "number" ||
              !Number.isSafeInteger(config.value) ||
              config.value < 1048576 ||
              config.value > 10485760)
          )
            throw new Error("Лимит вложений: целое число от 1048576 до 10485760 байт.");
        } catch (error) {
          valueError.textContent = (error as Error).message;
          const target = value.hidden ? booleanValue : value;
          target.setAttribute("aria-invalid", "true");
          target.focus();
          return;
        }
        input = { ...common, kind: "config", config };
      }
      void run(async (signal) => {
        status.textContent = "Сохраняем…";
        const response = saved
          ? await updateKey(saved.id, { ...input, version: saved.version }, signal)
          : await createKey(input, signal);
        written = true;
        pendingInput = input;
        if (!id) {
          const body = await response.json().catch(() => null);
          const location = response.headers.get("Location");
          const locationId = location
            ? new URL(location, window.location.origin).pathname.match(
                /\/keys\/([0-9a-f-]{36})\/?$/i
              )?.[1]
            : undefined;
          const createdId = typeof body?.id === "string" ? body.id : locationId;
          if (
            createdId &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(createdId)
          ) {
            await getKey(createdId, signal);
            if (events.signal.aborted) return;
            dirty = false;
            busy = false;
            navigate(`/onlineconf/keys/${createdId}`, true);
            return;
          }
        }
        await readBack(signal);
      });
    },
    { signal: events.signal }
  );
  main.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("[data-key-load]")) load();
      if (busy) return;
      if (event.target.closest("[data-key-reset]")) {
        if (written) {
          status.textContent = "Сначала загрузите актуальную версию.";
          return;
        }
        if (!dirty || window.confirm("Сбросить несохранённые изменения?")) {
          populate();
          status.textContent = "Изменения сброшены.";
        }
      }
      if (
        event.target.closest("[data-key-reload]") &&
        (!dirty || window.confirm("Заменить черновик актуальной версией с сервера?"))
      ) {
        void run(async (signal) => {
          if (pendingInput) await readBack(signal);
          else if (id) {
            const key = await getKey(id, signal);
            if (events.signal.aborted) return;
            saved = key;
            written = false;
            reloadButton.hidden = true;
            populate();
            status.textContent = "Загружена актуальная версия.";
          }
        });
      }
      if (event.target.closest("[data-format-json]")) {
        try {
          const config = readConfig(valueType.value, value.value, booleanValue.checked);
          value.value = JSON.stringify(config.value, null, 2);
          valueError.textContent = "";
          value.removeAttribute("aria-invalid");
          dirty = flagDirty || snapshot() !== baseline;
        } catch (error) {
          valueError.textContent = (error as Error).message;
          value.setAttribute("aria-invalid", "true");
          value.focus();
        }
      }
      if (
        event.target.closest("[data-key-delete]") &&
        saved &&
        !written &&
        window.confirm(`Удалить ключ «${saved.scope}/${saved.key}»?`)
      ) {
        void run(async (signal) => {
          status.textContent = "Удаляем…";
          await deleteKey(saved!.id, saved!.version, signal);
          if (events.signal.aborted) return;
          dirty = false;
          busy = false;
          navigate("/onlineconf/");
        });
      }
    },
    { signal: events.signal }
  );
  window.addEventListener(
    "beforeunload",
    (event) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    },
    { signal: events.signal }
  );
  load();
  return {
    canLeave,
    destroy: () => {
      events.abort();
      flagEditor?.destroy();
      request?.abort();
    },
  };
}
