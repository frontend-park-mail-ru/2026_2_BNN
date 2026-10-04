export function mountAuthForm(page, root) {
    page.form = root.querySelector("form");
    page.onSubmit = (event) => page.handleSubmit(event);
    page.form.addEventListener("submit", page.onSubmit);
}

export function destroyAuthForm(page) {
    page.form?.removeEventListener("submit", page.onSubmit);
    page.form = null;
    page.onSubmit = null;
}

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

export function setFormFieldError(form, name, message) {
    const error = form.querySelector(`[data-error-for="${name}"]`);
    error.textContent = message;
    error.closest(".field").classList.add("has-error");
}

export function setFormFeedback(form, message) {
    const feedback = form.querySelector(".form-feedback");
    feedback.textContent = message;
    feedback.classList.remove("is-success");
    feedback.classList.add("is-error");
}

export function setFormLoading(form, isLoading) {
    const button = form.querySelector(".login-button");
    button.disabled = isLoading;
    button.classList.toggle("is-loading", isLoading);
}
