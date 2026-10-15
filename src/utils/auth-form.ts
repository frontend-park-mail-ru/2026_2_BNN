export type SubmitHandler = (event: SubmitEvent) => void | Promise<void>;
export type InputHandler = (event: Event) => void;

export interface AuthPage {
  form: HTMLFormElement | null;
  onSubmit: SubmitHandler | null;
  onInput: InputHandler | null;
  validateField(name: string, value: string): boolean;
  handleSubmit(event: SubmitEvent): void | Promise<void>;
}

/**
 * Находит форму на странице и подключает обработчики submit и input.
 *
 * @param page Объект страницы, где хранится состояние формы.
 * @param root Корневой DOM-узел отрендеренной страницы.
 */
export function mountAuthForm(page: AuthPage, root: ParentNode): void {
  const form = root.querySelector("form");
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  page.form = form;

  const onSubmit: SubmitHandler = (event) => page.handleSubmit(event);
  const onInput: InputHandler = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.name) {
      return;
    }

    const isEmpty = input.name === "login" ? input.value.trim() === "" : input.value === "";
    if (isEmpty) {
      clearFormFieldError(form, input.name);
      return;
    }

    page.validateField(input.name, input.value);
  };

  page.onSubmit = onSubmit;
  page.onInput = onInput;
  form.addEventListener("submit", onSubmit);
  form.addEventListener("input", onInput);
}

/**
 * Снимает обработчики формы и очищает ссылки на её элементы.
 *
 * @param page Объект страницы, на котором ранее вызывался mountAuthForm.
 */
export function destroyAuthForm(page: AuthPage): void {
  if (page.form && page.onSubmit) {
    page.form.removeEventListener("submit", page.onSubmit);
  }
  if (page.form && page.onInput) {
    page.form.removeEventListener("input", page.onInput);
  }

  page.form = null;
  page.onSubmit = null;
  page.onInput = null;
}

/**
 * Удаляет все сообщения об ошибках и классы валидации с формы.
 *
 * @param form HTML-форма с полями `.field`, сообщениями `.field-error` и блоком `.form-feedback`.
 */
export function clearFormErrors(form: HTMLFormElement): void {
  form.querySelectorAll(".field").forEach((field) => {
    field.classList.remove("has-error");
  });
  form.querySelectorAll(".field-error").forEach((error) => {
    error.textContent = "";
  });

  const feedback = form.querySelector(".form-feedback");
  if (!feedback) {
    return;
  }

  feedback.textContent = "";
  feedback.classList.remove("is-error", "is-success");
}

/**
 * Показывает ошибку для конкретного поля формы.
 *
 * @param form HTML-форма.
 * @param name Имя поля, совпадает со значением `data-error-for`.
 * @param message Текст ошибки.
 */
export function setFormFieldError(form: HTMLFormElement, name: string, message: string): void {
  const error = form.querySelector(`[data-error-for="${name}"]`);
  if (!error) {
    return;
  }

  error.textContent = message;
  error.closest(".field")?.classList.add("has-error");
}

/**
 * Снимает ошибку с конкретного поля формы.
 *
 * @param form HTML-форма.
 * @param name Имя поля, совпадает со значением `data-error-for`.
 */
export function clearFormFieldError(form: HTMLFormElement, name: string): void {
  const error = form.querySelector(`[data-error-for="${name}"]`);
  if (!error) {
    return;
  }

  error.textContent = "";
  error.closest(".field")?.classList.remove("has-error");
}

/**
 * Показывает общее сообщение об ошибке формы.
 *
 * @param form HTML-форма.
 * @param message Текст сообщения.
 */
export function setFormFeedback(form: HTMLFormElement, message: string): void {
  const feedback = form.querySelector(".form-feedback");
  if (!feedback) {
    return;
  }

  feedback.textContent = message;
  feedback.classList.remove("is-success");
  feedback.classList.add("is-error");
}

/**
 * Переключает состояние загрузки submit-кнопки формы.
 *
 * @param form HTML-форма.
 * @param isLoading `true`, пока идёт сетевой запрос.
 */
export function setFormLoading(form: HTMLFormElement, isLoading: boolean): void {
  const button = form.querySelector(".login-button");
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  button.disabled = isLoading;
  button.classList.toggle("is-loading", isLoading);
}

/**
 * Проверяет длину логина.
 *
 * @param login Логин без пробелов по краям.
 * @returns Текст ошибки или пустая строка, если длина допустима.
 */
export function getLoginError(login: string): string {
  if (login.length < 3) {
    return "Логин должен быть не менее 3 символов";
  }
  if (login.length > 20) {
    return "Логин не должен быть больше 20 символов";
  }
  return "";
}

/**
 * Проверяет длину пароля.
 *
 * @param password Пароль как введён, без обрезки пробелов.
 * @returns Текст ошибки или пустая строка, если длина допустима.
 */
export function getPasswordError(password: string): string {
  if (password.length < 8) {
    return "Пароль должен быть не менее 8 символов";
  }
  if (password.length > 128) {
    return "Пароль не должен быть больше 128 символов";
  }
  return "";
}
