export const LoginPage = {
    render() {
        const template = Handlebars.templates["login"];
        return template({ title: "Login" });
    },
};