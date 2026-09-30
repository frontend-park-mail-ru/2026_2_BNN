export const HomePage = {
    render() {
        const template = Handlebars.templates["home"];
        return template({ title: "Home" });
    },
};