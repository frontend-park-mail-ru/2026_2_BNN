export const NotesPage = {
    async render() {
        const template = Handlebars.templates["notes"];
        return template({
            title: "Название",
            text: "Текст",
            userInitial: "K",
            sectionTitle: "Все заметки",
            breadcrumbs: [
                { href: "/notes/folders/1", label: "Папка" },
            ],
            notes: [
                { href: "/notes/1", title: "Заметка 1", preview: "Текст заметки", isActive: true },
                { href: "/notes/2", title: "Заметка 2", preview: "Текст заметки", isActive: false },
                { href: "/notes/3", title: "Заметка 3", preview: "Текст заметки", isActive: false },
            ],
        });
    },
};
