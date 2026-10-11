/**
 * @typedef {Object} AuthPage
 * @property {HTMLFormElement | null} [form] Текущая форма страницы авторизации/регистрации.
 * @property {(event: SubmitEvent) => void | Promise<void> | null} [onSubmit] Ссылка на обработчик submit.
 * @property {(event: Event) => void | null} [onInput] Ссылка на обработчик ввода.
 * @property {(name: string) => boolean} validateField Проверка одного поля.
 * @property {(event: SubmitEvent) => void | Promise<void>} handleSubmit Бизнес-обработчик submit.
 */

/**
 * Находит форму на странице и подключает обработчики submit и input.
 *
 * @param {AuthPage} page Объект страницы, где хранится состояние формы.
 * @param {ParentNode} root Корневой DOM-узел отрендеренной страницы.
 * @returns {void}
 */
export function mountAuthForm(page, root) {
  page.form = root.querySelector("form");
  page.onSubmit = (event) => page.handleSubmit(event);
  page.onInput = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.name) {
      return;
    }

    const isEmpty = input.name === "login" ? input.value.trim() === "" : input.value === "";
    if (isEmpty) {
      clearFormFieldError(page.form, input.name);
      return;
    } 

    console.log(input.name);
    page.validateField(input.name);
  };

  page.form.addEventListener("submit", page.onSubmit);
  page.form.addEventListener("input", page.onInput);
}

/**
 * Снимает обработчики формы и очищает ссылки на её элементы.
 *
 * @param {AuthPage} page Объект страницы, на котором ранее вызывался {@link mountAuthForm}.
 * @returns {void}
 */
export function destroyAuthForm(page) {
  page.form?.removeEventListener("submit", page.onSubmit);
  page.form?.removeEventListener("input", page.onInput);
  page.form = null;
  page.onSubmit = null;
  page.onInput = null;
}

/**
 * Удаляет все сообщения об ошибках и классы валидации с формы.
 *
 * @param {HTMLFormElement} form HTML-форма, содержащая поля `.field`,
 * сообщения `.field-error` и блок `.form-feedback`.
 * @returns {void}
 */
export function clearFormErrors(form) {
  form.querySelectorAll(".field").forEach((field) => {
    field.classList.remove("has-error");
  });
  form.querySelectorAll(".field-error").forEach((error) => {
    error.textContent = "";
  });

  const feedback = form.querySelector(".form-feedback");
  feedback.textContent = "";
  feedback.classList.remove("is-error", "is-success");
}

/**
 * Показывает ошибку для конкретного поля формы.
 *
 * @param {HTMLFormElement} form HTML-форма.
 * @param {string} name Имя поля (совпадает со значением `data-error-for`).
 * @param {string} message Текст ошибки.
 * @returns {void}
 */
export function setFormFieldError(form, name, message) {
  const error = form.querySelector(`[data-error-for="${name}"]`);
  error.textContent = message;
  error.closest(".field").classList.add("has-error");
}

/**
 * Снимает ошибку с конкретного поля формы.
 *
 * @param {HTMLFormElement} form HTML-форма.
 * @param {string} name Имя поля (совпадает со значением `data-error-for`).
 * @returns {void}
 */
export function clearFormFieldError(form, name) {
  const error = form.querySelector(`[data-error-for="${name}"]`);
  error.textContent = "";
  error.closest(".field").classList.remove("has-error");
}

/**
 * Показывает общее сообщение об ошибке формы.
 *
 * @param {HTMLFormElement} form HTML-форма.
 * @param {string} message Текст сообщения.
 * @returns {void}
 */
export function setFormFeedback(form, message) {
  const feedback = form.querySelector(".form-feedback");
  feedback.textContent = message;
  feedback.classList.remove("is-success");
  feedback.classList.add("is-error");
}

/**
 * Переключает состояние загрузки submit-кнопки формы.
 *
 * @param {HTMLFormElement} form HTML-форма.
 * @param {boolean} isLoading Признак активного сетевого запроса.
 * @returns {void}
 */
export function setFormLoading(form, isLoading) {
  const button = form.querySelector(".login-button");
  button.disabled = isLoading;
  button.classList.toggle("is-loading", isLoading);
}
