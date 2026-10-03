export const LoginPage = {
    async render() {
        const template = Handlebars.templates["login"];
        return template({ title: "Авторизация" });
    },
};