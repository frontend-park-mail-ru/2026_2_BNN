import {
  advanceRollout,
  ApiError,
  getRolloutState,
  listRolloutPlans,
  setRolloutPlan,
} from "../api/api";
import template from "../templates/flag-rollout.hbs";
import type { RolloutPlan, RolloutState } from "../types/onlineconf";

const STATUS: Record<RolloutState["status"], string> = {
  waiting: "Ожидание следующего этапа",
  pending_approval: "Требуется подтверждение",
  done: "Раскатка завершена",
};

type WriteRollout = (action: (signal: AbortSignal) => Promise<void>) => Promise<void>;

/** Показывает состояние раскатки и передаёт запись общей карточке для обновления версии. */
export function mountFlagRollout(
  host: HTMLElement,
  keyId: string,
  write: WriteRollout,
  onAccessError: (error: ApiError) => void,
  onManagedChange: (managed: boolean) => void
) {
  host.innerHTML = template({});
  const fields = host.querySelector("fieldset")!;
  const select = host.querySelector("select")!;
  const stateText = host.querySelector<HTMLElement>("[data-rollout-state]")!;
  const message = host.querySelector<HTMLElement>("[data-rollout-message]")!;
  const lockHint = host.querySelector<HTMLElement>("[data-rollout-lock-hint]")!;
  const bind = host.querySelector<HTMLButtonElement>("[data-rollout-bind]")!;
  const unbind = host.querySelector<HTMLButtonElement>("[data-rollout-unbind]")!;
  const approve = host.querySelector<HTMLButtonElement>("[data-rollout-approve]")!;
  const rollback = host.querySelector<HTMLButtonElement>("[data-rollout-rollback]")!;
  const reload = host.querySelector<HTMLButtonElement>("[data-rollout-reload]")!;
  const events = new AbortController();
  const { signal } = events;
  let request: AbortController | undefined;
  let plans: RolloutPlan[] = [];
  let state: RolloutState | null = null;
  let ready = false;
  let writeLocked = false;
  let busy = false;
  let savedPercent = 0;

  function syncControls(): void {
    fields.disabled = !ready || writeLocked || busy || Boolean(request);
    lockHint.hidden = !writeLocked;
    reload.disabled = busy || Boolean(request);
    bind.disabled = !select.value || select.value === state?.plan_id;
    unbind.hidden = !state;
    approve.hidden = state?.status !== "pending_approval";
    const plan = plans.find(({ id }) => id === state?.plan_id);
    rollback.hidden = !state || (plan ? savedPercent <= plan.steps[0] : false);
  }

  function showState(): void {
    const plan = plans.find(({ id }) => id === state?.plan_id);
    const selected = select.value;
    select.replaceChildren(
      new Option("Выберите регламент", ""),
      ...plans
        .filter((plan) => plan.steps.length >= 2 || plan.id === state?.plan_id)
        .map(({ name, id }) => new Option(name, id))
    );
    select.value = Array.from(select.options).some(
      ({ value }) => value === selected && value !== ""
    )
      ? selected
      : (plan?.id ?? "");
    if (!state) {
      stateText.textContent = "Регламент не привязан.";
      return;
    }

    const details = [plan?.name ?? "Привязанный регламент", STATUS[state.status]];
    if (plan) details.push(plan.steps.map((percent) => `${percent}%`).join(" → "));
    details.push(`Текущая раскатка: ${savedPercent}%`);
    if (state.current_step != null) details.push(`Текущий этап: ${state.current_step}`);
    if (state.next_step != null) details.push(`Следующий этап: ${state.next_step}`);
    if (state.step_ready_at && state.status === "waiting") {
      const date = new Date(state.step_ready_at);
      if (!Number.isNaN(date.getTime())) details.push(`Не раньше ${date.toLocaleString("ru-RU")}`);
    }
    stateText.textContent = details.join(" · ");
  }

  async function refresh(includePlans: boolean): Promise<void> {
    if (request || busy || signal.aborted) return;
    const current = new AbortController();
    request = current;
    const timeout = window.setTimeout(() => current.abort(), 10_000);
    if (includePlans) message.textContent = "Загружаем состояние раскатки…";
    syncControls();

    try {
      const [nextState, nextPlans] = await Promise.all([
        getRolloutState(keyId, current.signal),
        includePlans ? listRolloutPlans(current.signal) : plans,
      ]);
      if (signal.aborted) return;
      state = nextState;
      plans = nextPlans;
      ready = true;
      onManagedChange(Boolean(state));
      showState();
      message.textContent = "";
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) {
        onAccessError(error);
        return;
      }
      ready = false;
      stateText.textContent = "";
      message.textContent = "Не удалось получить состояние раскатки. Обновите его вручную.";
    } finally {
      current.abort();
      window.clearTimeout(timeout);
      request = undefined;
      if (!signal.aborted) syncControls();
    }
  }

  function change(
    confirmation: string,
    action: (requestSignal: AbortSignal) => Promise<void>
  ): void {
    if (fields.disabled || !window.confirm(confirmation)) return;
    void write(action).then(() => refresh(true));
  }

  select.addEventListener("change", syncControls, { signal });
  reload.addEventListener("click", () => void refresh(true), { signal });
  bind.addEventListener(
    "click",
    () => {
      const plan = plans.find(({ id }) => id === select.value);
      if (!plan || plan.steps.length < 2) return;
      change(`Привязать «${plan.name}»? Раскатка начнётся с ${plan.steps[0]}%.`, (requestSignal) =>
        setRolloutPlan(keyId, plan.id, requestSignal)
      );
    },
    { signal }
  );
  unbind.addEventListener(
    "click",
    () => {
      if (!state) return;
      change("Отвязать регламент от флага?", (requestSignal) =>
        setRolloutPlan(keyId, null, requestSignal)
      );
    },
    { signal }
  );
  approve.addEventListener(
    "click",
    () => {
      if (state?.status !== "pending_approval") return;
      change("Подтвердить переход на следующий этап?", (requestSignal) =>
        advanceRollout(keyId, "approve", requestSignal)
      );
    },
    { signal }
  );
  rollback.addEventListener(
    "click",
    () => {
      if (rollback.hidden) return;
      change("Откатить раскатку на предыдущий этап?", (requestSignal) =>
        advanceRollout(keyId, "rollback", requestSignal)
      );
    },
    { signal }
  );

  const poll = window.setInterval(() => {
    if (ready && state?.status === "waiting") void refresh(false);
  }, 15_000);
  void refresh(true);

  return {
    setContext(locked: boolean, saving: boolean, percent: number): void {
      writeLocked = locked;
      busy = saving;
      if (savedPercent !== percent) {
        savedPercent = percent;
        if (ready) showState();
      }
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
