/** Собирает шестизначный код из ячеек `[data-2fa-digit]` внутри формы или контейнера. */
export function twoFactorCode(root: ParentNode): string {
  return [...root.querySelectorAll<HTMLInputElement>("[data-2fa-digit]")]
    .map((input) => input.value)
    .join("");
}

function digitInputs(input: HTMLInputElement): HTMLInputElement[] {
  const code = input.closest(".profile-form__code, .login-form__code");
  if (!code) {
    return [];
  }
  return [...code.querySelectorAll<HTMLInputElement>("[data-2fa-digit]")];
}

/** Обрабатывает ввод и вставку цифр в ячейках TOTP. */
export function fillTwoFactorDigit(input: HTMLInputElement): void {
  const digits = input.value.replace(/\D/g, "");
  const inputs = digitInputs(input);
  const index = inputs.indexOf(input);

  if (digits.length <= 1) {
    input.value = digits;
    if (digits.length === 1) {
      inputs[index + 1]?.focus();
    }
    return;
  }

  for (let offset = 0; offset < digits.length && index + offset < inputs.length; offset++) {
    inputs[index + offset].value = digits[offset];
  }
  const next = Math.min(index + digits.length, inputs.length - 1);
  inputs[next]?.focus();
}

/**
 * Обрабатывает клавиатуру в ячейке TOTP.
 *
 * @returns `true`, если событие обработано и не нужно стандартное поведение.
 */
export function handleTwoFactorKeyDown(event: KeyboardEvent, onChange: () => void): boolean {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.matches("[data-2fa-digit]")) {
    return false;
  }

  const inputs = digitInputs(input);
  const index = inputs.indexOf(input);

  if (/^\d$/.test(event.key)) {
    event.preventDefault();
    input.value = event.key;
    inputs[index + 1]?.focus();
    onChange();
    return true;
  }

  if (event.key === "Backspace" && input.value === "") {
    const previous = inputs[index - 1];
    if (previous) {
      previous.value = "";
      previous.focus();
    }
    return true;
  }

  if (event.key === "ArrowLeft") {
    inputs[index - 1]?.focus();
    return true;
  }
  if (event.key === "ArrowRight") {
    inputs[index + 1]?.focus();
    return true;
  }

  return false;
}
