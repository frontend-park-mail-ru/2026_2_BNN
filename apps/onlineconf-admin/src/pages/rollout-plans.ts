import { ApiError, deleteRolloutPlan, listRolloutPlans, saveRolloutPlan } from "../api/api";
import template from "../templates/rollout-plans.hbs";
import type { RolloutPlan, RolloutPlanInput } from "../types/onlineconf";

/** Разбирает последовательность целых процентов, которая заканчивается на 100. */
function parseSteps(value: string): number[] | null {
  const parts = value.split(",").map((part) => part.trim());
  if (!parts.every((part) => /^\d{1,3}$/.test(part))) return null;

  const steps = parts.map(Number);
  return steps.length >= 2 &&
    steps.at(-1) === 100 &&
    steps.every((step, index) => index === 0 || step > steps[index - 1])
    ? steps
    : null;
}

/** Монтирует список и форму создания, изменения и удаления регламентов. */
export function mountRolloutPlans(
  main: HTMLElement,
  onAccessError: (error: ApiError) => void
): () => void {
  main.innerHTML = template({});
  const form = main.querySelector<HTMLFormElement>("[data-plans-form]")!;
  const fields = form.querySelector("fieldset")!;
  const select = form.querySelector<HTMLSelectElement>("[data-plans-select]")!;
  const name = form.querySelector<HTMLInputElement>("[data-plans-name]")!;
  const steps = form.querySelector<HTMLInputElement>("[data-plans-steps]")!;
  const interval = form.querySelector<HTMLInputElement>("[data-plans-interval]")!;
  const remove = form.querySelector<HTMLButtonElement>("[data-plans-delete]")!;
  const reload = main.querySelector<HTMLButtonElement>("[data-plans-reload]")!;
  const status = main.querySelector<HTMLElement>("[data-plans-status]")!;
  const events = new AbortController();
  const { signal } = events;
  let request: AbortController | undefined;
  let plans: RolloutPlan[] = [];
  let listReady = false;

  function fill(): void {
    const plan = plans.find(({ id }) => id === select.value);
    name.value = plan?.name ?? "";
    steps.value = plan?.steps.join(", ") ?? "";
    interval.value = plan ? String(plan.interval_min) : "";
    remove.hidden = !plan;
  }

  async function refresh(requestSignal: AbortSignal, selected: string): Promise<void> {
    const next = await listRolloutPlans(requestSignal);
    if (signal.aborted) return;
    plans = next;
    select.replaceChildren(
      new Option("Новый регламент", ""),
      ...plans.map((plan) => new Option(plan.name, plan.id))
    );
    select.value = plans.some(({ id }) => id === selected) ? selected : "";
    listReady = true;
    fill();
  }

  async function run(
    action: (requestSignal: AbortSignal) => Promise<void>,
    loading: string
  ): Promise<void> {
    if (request || signal.aborted) return;
    const current = new AbortController();
    request = current;
    const timeout = window.setTimeout(() => current.abort(), 10_000);
    fields.disabled = reload.disabled = true;
    status.textContent = loading;

    try {
      await action(current.signal);
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ApiError && (error.status === 401 || error.code === "NOT_FOUND")) {
        onAccessError(error);
        return;
      }
      status.textContent = current.signal.aborted
        ? "Сервер не ответил вовремя. Обновите список."
        : error instanceof ApiError
          ? error.message
          : "Не удалось выполнить операцию.";
    } finally {
      window.clearTimeout(timeout);
      request = undefined;
      if (!signal.aborted) {
        reload.disabled = false;
        fields.disabled = !listReady;
      }
    }
  }

  function load(): void {
    void run(async (requestSignal) => {
      await refresh(requestSignal, select.value);
      if (!signal.aborted) status.textContent = plans.length ? "" : "Регламентов пока нет.";
    }, "Загружаем регламенты…");
  }

  async function refreshAfterWrite(
    requestSignal: AbortSignal,
    selected: string,
    message: string
  ): Promise<void> {
    listReady = false;
    try {
      await refresh(requestSignal, selected);
      if (!signal.aborted) status.textContent = message;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.code === "NOT_FOUND"))
        throw error;
      if (!signal.aborted)
        status.textContent = `${message} Не удалось перечитать список. Нажмите «Обновить список».`;
    }
  }

  select.addEventListener("change", fill, { signal });
  reload.addEventListener("click", load, { signal });
  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      if (!listReady || request) return;
      const parsed = parseSteps(steps.value);
      if (!parsed) {
        status.textContent =
          "Укажите минимум два возрастающих целых процента через запятую. Последний шаг — 100.";
        steps.focus();
        return;
      }
      const input: RolloutPlanInput = {
        name: name.value.trim(),
        steps: parsed,
        interval_min: interval.valueAsNumber,
      };
      if (!input.name || !Number.isSafeInteger(input.interval_min) || input.interval_min < 1) {
        status.textContent = "Укажите название и положительный целый интервал.";
        (input.name ? interval : name).focus();
        return;
      }
      const id = select.value || null;
      void run(async (requestSignal) => {
        await saveRolloutPlan(input, id, requestSignal);
        if (!signal.aborted)
          await refreshAfterWrite(requestSignal, id ?? "", "Регламент сохранён.");
      }, "Сохраняем регламент…");
    },
    { signal }
  );

  remove.addEventListener(
    "click",
    () => {
      const plan = plans.find(({ id }) => id === select.value);
      if (!listReady || request || !plan || !window.confirm(`Удалить регламент «${plan.name}»?`))
        return;
      void run(async (requestSignal) => {
        await deleteRolloutPlan(plan.id, requestSignal);
        if (!signal.aborted) await refreshAfterWrite(requestSignal, "", "Регламент удалён.");
      }, "Удаляем регламент…");
    },
    { signal }
  );

  load();
  return () => {
    events.abort();
    request?.abort();
  };
}
