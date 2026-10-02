export const NotesPage = {
    render() {
        const template = Handlebars.templates["notes"];
        return template({ title: "Notes" });
    },
};
