export const SignupPage = {
    async render() {
        const template = Handlebars.templates["signup"];
        return template({ title: "Регистрация" });
    },
};