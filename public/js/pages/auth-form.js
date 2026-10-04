/**
 * @typedef {Object} AuthPage
 * @property {HTMLFormElement | null} [form] Текущая форма страницы авторизации/регистрации.
 * @property {(event: SubmitEvent) => void | Promise<void> | null} [onSubmit] Ссылка на обработчик submit.
 * @property {(event: SubmitEvent) => void | Promise<void>} handleSubmit Бизнес-обработчик submit.
 */

/**
 * Находит форму на странице и подключает обработчик submit.
 *
 * @param {AuthPage} page Объект страницы, где хранится состояние формы.
 * @param {ParentNode} root Корневой DOM-узел отрендеренной страницы.
 * @returns {void}
 */
export function mountAuthForm(page, root) {
  page.form = root.querySelector("form");
  page.onSubmit = (event) => page.handleSubmit(event);
  page.form.addEventListener("submit", page.onSubmit);
}

/**
 * Снимает обработчик submit и очищает ссылки на элементы формы.
 *
 * @param {AuthPage} page Объект страницы, на котором ранее вызывался {@link mountAuthForm}.
 * @returns {void}
 */
export function destroyAuthForm(page) {
  page.form?.removeEventListener("submit", page.onSubmit);
  page.form = null;
  page.onSubmit = null;
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
