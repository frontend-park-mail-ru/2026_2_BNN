export const NotesPage = {
    async render() {
        const template = Handlebars.templates["notes"];
        return template({ title: "Notes" });
    },
};
