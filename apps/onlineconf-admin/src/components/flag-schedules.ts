import { ApiError, cancelFlagSchedule, createFlagSchedule, listFlagSchedules } from "../api/api";
import template from "../templates/flag-schedules.hbs";
import type { FlagSchedule, FlagScheduleInput } from "../types/onlineconf";

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
});
const zone = dateFormat.resolvedOptions().timeZone ?? "локальное время";

/** Преобразует локальный ввод в UTC, отклоняя несуществующее местное время. */
function localTimeToUtc(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(value);
  if (
    date.getTime() <= Date.now() ||
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  )
    return null;

  return date.toISOString();
}

function describeChange(schedule: {
  enabled?: boolean | null;
  rollout_percent?: number | null;
}): string {
  const changes: string[] = [];
  if (schedule.enabled != null) changes.push(schedule.enabled ? "Включить флаг" : "Выключить флаг");
  if (schedule.rollout_percent != null) changes.push(`Раскатка: ${schedule.rollout_percent}%`);
  return changes.join(" · ");
}

type ScheduleEvents = {
  onAccessError: (error: ApiError) => void;
  onWritingChange: (writing: boolean) => void;
  onPendingChange: (pending: boolean) => void;
  onExecuted: () => void;
};

/** Управляет серверным расписанием для сохранённого флага. */
export function mountFlagSchedules(host: HTMLElement, keyId: string, callbacks: ScheduleEvents) {
  host.innerHTML = template({ zone });
  const form = host.querySelector<HTMLFormElement>("[data-schedules-form]")!;
  const fields = form.querySelector("fieldset")!;
  const list = host.querySelector<HTMLUListElement>("[data-schedules-list]")!;
  const message = host.querySelector<HTMLElement>("[data-schedules-status]")!;
  const lock = host.querySelector<HTMLElement>("[data-schedules-lock]")!;
  const reload = host.querySelector<HTMLButtonElement>("[data-schedules-reload]")!;
  const runAt = form.querySelector<HTMLInputElement>("#schedule-run-at")!;
  const enabled = form.querySelector<HTMLSelectElement>("#schedule-enabled")!;
  const percent = form.querySelector<HTMLInputElement>("#schedule-percent")!;
  const events = new AbortController();
  const { signal } = events;

  let request: AbortController | undefined;
  let schedules: FlagSchedule[] = [];
  let ready = false;
  let locked = false;
  let managed: boolean | null = null;
  let refreshFailed = false;
  let hasLoadedSchedules = false;

  function syncControls(): void {
    reload.disabled = Boolean(request);
    fields.disabled = Boolean(request) || !ready || locked || managed !== false;
    for (const button of list.querySelectorAll("button")) {
      button.disabled = Boolean(request) || !ready || locked;
    }

    lock.textContent = locked
      ? "Сначала сохраните черновик или загрузите актуальную версию карточки."
      : managed === true
        ? "Пока привязан регламент, новые задачи расписания недоступны."
        : managed === null
          ? "Создание доступно после проверки привязки регламента."
          : "";
  }

  function renderList(): void {
    const rows = [...schedules].sort((a, b) => Date.parse(a.run_at) - Date.parse(b.run_at));
    list.replaceChildren(
      ...rows.map((schedule) => {
        const item = document.createElement("li");
        const time = document.createElement("time");
        time.dateTime = schedule.run_at;
        time.textContent = `${dateFormat.format(new Date(schedule.run_at))} (${zone})`;
        item.append(
          time,
          ` · ${schedule.done ? "Выполнено" : "Запланировано"} · ${describeChange(schedule)}`
        );

        if (!schedule.done) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = "Отменить";
          button.setAttribute("aria-label", `Отменить задачу на ${time.textContent}`);
          button.addEventListener("click", () => cancel(schedule));
          item.append(button);
        }
        return item;
      })
    );
  }

  async function read(requestSignal: AbortSignal): Promise<void> {
    const next = await listFlagSchedules(keyId, requestSignal);
    if (signal.aborted) return;

    const completedIds = new Set(schedules.filter((schedule) => schedule.done).map(({ id }) => id));
    const executed =
      hasLoadedSchedules && next.some(({ id, done }) => done && !completedIds.has(id));
    const unchanged = JSON.stringify(schedules) === JSON.stringify(next);
    schedules = next;
    hasLoadedSchedules = true;
    ready = true;
    if (!unchanged) renderList();
    callbacks.onPendingChange(schedules.some(({ done }) => !done));
    if (executed) callbacks.onExecuted();
  }

  /** Выполняет одну операцию, освобождая форму даже при таймауте. */
  async function run(
    action: (requestSignal: AbortSignal) => Promise<void>,
    loading: string,
    writing = false
  ): Promise<void> {
    if (request || signal.aborted) return;
    const current = new AbortController();
    request = current;
    const timeout = window.setTimeout(() => current.abort(), 10_000);
    if (writing) callbacks.onWritingChange(true);
    if (loading) message.textContent = loading;
    syncControls();

    try {
      await action(current.signal);
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) {
        callbacks.onAccessError(error);
        return;
      }
      ready = false;
      refreshFailed = !writing;
      message.textContent = current.signal.aborted
        ? "Сервер не ответил вовремя. Обновите расписание."
        : error instanceof ApiError && error.code === "ROLLOUT_STEP_NOT_ALLOWED"
          ? "Изменение запрещено регламентом раскатки."
          : error instanceof ApiError && error.code === "NOT_FOUND"
            ? "Расписание или задача недоступны."
            : error instanceof ApiError
              ? error.message
              : "Не удалось выполнить операцию. Обновите расписание.";
    } finally {
      window.clearTimeout(timeout);
      request = undefined;
      if (!signal.aborted) {
        if (writing) callbacks.onWritingChange(false);
        syncControls();
      }
    }
  }

  async function refreshAfterWrite(requestSignal: AbortSignal, success: string): Promise<void> {
    try {
      await read(requestSignal);
      if (!signal.aborted) message.textContent = success;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw error;
      if (!signal.aborted)
        message.textContent = `${success} Обновите расписание, чтобы увидеть актуальный список.`;
    }
  }

  function load(manual: boolean): void {
    void run(
      async (requestSignal) => {
        await read(requestSignal);
        if (signal.aborted) return;
        if (manual || refreshFailed)
          message.textContent = schedules.length ? "" : "Задач пока нет.";
        refreshFailed = false;
      },
      manual ? "Загружаем расписание…" : ""
    );
  }

  function cancel(schedule: FlagSchedule): void {
    if (
      request ||
      !ready ||
      locked ||
      schedule.done ||
      !window.confirm("Отменить запланированное изменение?")
    )
      return;
    void run(
      async (requestSignal) => {
        await cancelFlagSchedule(keyId, schedule.id, requestSignal);
        if (signal.aborted) return;
        ready = false;
        await refreshAfterWrite(requestSignal, "Задача отменена.");
      },
      "Отменяем задачу…",
      true
    );
  }

  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      if (fields.disabled) return;

      const time = localTimeToUtc(runAt.value);
      if (!time) {
        message.textContent = "Выберите корректную дату и время в будущем.";
        runAt.focus();
        return;
      }

      const input: FlagScheduleInput = { run_at: time };
      if (enabled.value) input.enabled = enabled.value === "true";
      if (percent.value) {
        const value = percent.valueAsNumber;
        if (!Number.isInteger(value) || value < 0 || value > 100) {
          message.textContent = "Введите целый процент от 0 до 100.";
          percent.focus();
          return;
        }
        input.rollout_percent = value;
      }
      const change = describeChange(input);
      if (!change) {
        message.textContent = "Выберите состояние флага или новый процент раскатки.";
        return;
      }
      if (
        !window.confirm(
          `Запланировать изменение на ${dateFormat.format(new Date(time))} (${zone})?\n${change}`
        )
      )
        return;

      void run(
        async (requestSignal) => {
          await createFlagSchedule(keyId, input, requestSignal);
          if (signal.aborted) return;
          callbacks.onPendingChange(true);
          ready = false;
          form.reset();
          await refreshAfterWrite(requestSignal, "Изменение запланировано.");
        },
        "Сохраняем расписание…",
        true
      );
    },
    { signal }
  );

  reload.addEventListener("click", () => load(true), { signal });
  const poll = window.setInterval(() => {
    if (schedules.some(({ done }) => !done)) load(false);
  }, 15_000);
  load(true);

  return {
    setContext(blocked: boolean, rolloutManaged: boolean | null): void {
      locked = blocked;
      managed = rolloutManaged;
      syncControls();
    },
    destroy(): void {
      events.abort();
      request?.abort();
      window.clearInterval(poll);
      host.replaceChildren();
    },
  };
}
