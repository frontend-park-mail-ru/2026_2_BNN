const SPRITE = "/assets/icons/ui/sprite.svg";

/**
 * Переключает видимость пароля в связанном поле и обновляет иконку кнопки.
 *
 * @param button Кнопка с `[data-password-toggle]`.
 */
export function togglePasswordVisibility(button: HTMLButtonElement): void {
  const input = button.parentElement?.querySelector("input");
  const use = button.querySelector("use");
  if (!(input instanceof HTMLInputElement) || !use) {
    return;
  }

  const willShow = input.type === "password";
  input.type = willShow ? "text" : "password";
  use.setAttribute("href", willShow ? `${SPRITE}#eye-off` : `${SPRITE}#eye`);
  button.setAttribute("aria-label", willShow ? "Скрыть пароль" : "Показать пароль");
}

/**
 * Обрабатывает клик по кнопке показа пароля внутри формы.
 *
 * @param event Событие click.
 * @returns `true`, если клик был по переключателю пароля.
 */
export function handlePasswordToggleClick(event: MouseEvent): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }

  const button = target.closest("[data-password-toggle]");
  if (!(button instanceof HTMLButtonElement)) {
    return false;
  }

  togglePasswordVisibility(button);
  return true;
}

/**
 * Возвращает все переключатели пароля в контейнере к состоянию «скрыто».
 *
 * @param root Форма или фрагмент DOM с кнопками `[data-password-toggle]`.
 */
export function resetPasswordToggles(root: ParentNode): void {
  root.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.setAttribute("aria-label", "Показать пароль");
    button.querySelector("use")?.setAttribute("href", `${SPRITE}#eye`);
  });
}
