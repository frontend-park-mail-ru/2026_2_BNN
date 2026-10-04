import { api } from "../api.js";
import { router, navigate, resetAuthState } from "../router.js";

const SECTIONS = [
    { href: "/notes", icon: "file", title: "Все заметки" },
    { href: "/notes/favourites", icon: "heart", title: "Избранное" },
    { href: "/notes/trash", icon: "trash", title: "Корзина" },
];

const MAIL_SECTION = { href: "/notes/mail", icon: "mail", title: "Почта" };

const ALL_SECTIONS = [...SECTIONS, MAIL_SECTION];

const NOTES_LIMIT = 100;
const SEARCH_DELAY = 200;

const SKELETON_ROWS = [1, 2, 3, 4, 5, 6];

const store = {
    status: "idle",
    notes: [],
    error: "",
    query: "",
};

let notesRequest = null;
let mounted = null;

function getParagraphs(note) {
    const paragraphs = [];

    if (!Array.isArray(note.blocks)) {
        return paragraphs;
    }

    for (const block of note.blocks) {
        if (block.content) {
            paragraphs.push(block.content);
        }
    }
    return paragraphs;
}

function normalizeNote(note) {
    let title = note.title;
    if (!title) {
        title = "Без названия";
    }

    let parentId = null;
    if (note.parent_note_id) {
        parentId = String(note.parent_note_id);
    }

    const paragraphs = getParagraphs(note);

    return {
        id: String(note.id),
        parentId: parentId,
        title: title,
        paragraphs: paragraphs,
        text: paragraphs.join(" "),
    };
}

async function fetchAllNotes() {
    const notes = [];
    let offset = 0;

    while (true) {
        const response = await api.getNotes(NOTES_LIMIT, offset);
        let list = [];
        if (Array.isArray(response)) {
            list = response;
        }

        for (const note of list) {
            notes.push(normalizeNote(note));
        }

        if (list.length < NOTES_LIMIT) {
            return notes;
        }
        offset += NOTES_LIMIT;
    }
}

function getCurrentSection(path) {
    for (const section of ALL_SECTIONS) {
        if (section.href === path) {
            return section;
        }
    }
    return SECTIONS[0];
}

function filterNotes(notes, query) {
    const search = query.trim().toLowerCase();

    if (search === "") {
        return notes;
    }

    const result = [];
    for (const note of notes) {
        const noteText = (note.title + " " + note.text).toLowerCase();
        if (noteText.includes(search)) {
            result.push(note);
        }
    }
    return result;
}

function findNote(notes, id) {
    if (!id) {
        return null;
    }

    for (const note of notes) {
        if (note.id === id) {
            return note;
        }
    }
    return null;
}

function buildView(context) {
    const path = context.path;
    const params = context.params;

    const currentSection = getCurrentSection(path);
    const foundNotes = filterNotes(store.notes, store.query);
    const currentNote = findNote(store.notes, params.id);

    const isReady = store.status === "ready";
    const isError = store.status === "error";
    const isLoading = !isReady && !isError;
    const hasNotes = store.notes.length > 0;

    function isActive(section) {
        return section === currentSection;
    }

    const sections = [];
    for (const section of SECTIONS) {
        sections.push({ ...section, isActive: isActive(section) });
    }

    const notes = [];
    for (const note of foundNotes) {
        notes.push({
            href: "/notes/" + note.id,
            title: note.title,
            isActive: note === currentNote,
        });
    }

    let title = "";
    let paragraphs = [];
    const breadcrumbs = [{ href: "/notes", label: "Все заметки" }];

    if (currentNote) {
        title = currentNote.title;
        paragraphs = currentNote.paragraphs;

        const parentNote = findNote(store.notes, currentNote.parentId);
        if (parentNote) {
            breadcrumbs.push({ href: "/notes/" + parentNote.id, label: parentNote.title });
        }
    }

    return {
        query: store.query,
        userLogin: api.getCachedProfile()?.login ?? "",

        sectionTitle: currentSection.title,
        sections: sections,
        mailSection: { ...MAIL_SECTION, isActive: isActive(MAIL_SECTION) },

        isLoading: isLoading,
        isError: isError,
        errorMessage: store.error,
        isEmpty: isReady && !hasNotes,
        isNotFound: !isLoading && hasNotes && foundNotes.length === 0,
        skeletonRows: SKELETON_ROWS,

        notes: notes,
        title: title,
        paragraphs: paragraphs,
        breadcrumbs: breadcrumbs,
    };
}

async function loadNotes() {
    store.status = "loading";
    store.error = "";

    try {
        store.notes = await fetchAllNotes();
        store.status = "ready";
    } catch (error) {
        store.notes = [];

        if (error.status === 401) {
            store.status = "unauthorized";
            return;
        }

        store.status = "error";
        if (error.status) {
            store.status = error.message;
        } else {
            store.error = "Не удалось связаться с сервером";
        }
    }
}

function waitForNotes() {
    if (store.status !== "loading") {
        notesRequest = loadNotes();
    }
    return notesRequest;
}

export const NotesPage = {
    async render(context) {
        const template = Handlebars.templates["notes"];
        const view = buildView(context);
        return template(view);
    },

    async mount(root, context) {
        const page = root.querySelector(".notes-page");
        const listRegion = page.querySelector("[data-notes-list]");
        const mainRegion = page.querySelector("[data-notes-main]");
        const search = page.querySelector("[data-search]");

        const instance = {
            page: page,
            search: search,
            searchTimer: null,
            onSearchInput: onSearchInput,
            onPageClick: onPageClick,
        };

        function update() {
            const view = buildView(context);
            listRegion.innerHTML = Handlebars.partials["notes-list"](view);
            mainRegion.innerHTML = Handlebars.partials["notes-main"](view);
        }

        async function loadAndShow() {
            await waitForNotes();
        
            if (mounted !== instance) {
                return;
            }
        
            if (store.status === "unauthorized") {
                store.status = "idle";
                history.replaceState(null, "", "/login");
                router();
                return;
            }
        
            update();
        }

        function runSearch() {
            instance.searchTimer = null;
            store.query = search.value;
            update();
        }

        function onSearchInput() {
            clearTimeout(instance.searchTimer);
            instance.searchTimer = setTimeout(runSearch, SEARCH_DELAY);
        }

        function onPageClick(event) {
            if (event.target.closest("[data-retry]")) {
                store.status = "idle";
                update();
                loadAndShow();
                return;
            }

            const clearButton = event.target.closest("[data-search-clear]");

            if (clearButton) {
                clearTimeout(instance.searchTimer);
                instance.searchTimer = null;
                search.value = "";
                store.query = "";
                update();
                search.focus();
                return;
            }

            const logoutButton = event.target.closest("[data-logout]");
            if (!logoutButton) {
                return;
            }

            logoutButton.disabled = true;
            document.cookie = "bnn_jwt=; Max-Age=0; path=/; SameSite=Lax";
            document.cookie = "bnn_jwt=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax";

            resetAuthState();
            navigate("/login");
        }

        search.addEventListener("input", onSearchInput);
        page.addEventListener("click", onPageClick);

        mounted = instance;

        if (store.status === "ready") {
            return;
        }
        
        await loadAndShow();

        if (mounted !== instance) {
            return;
        }

        update();
    },

    destroy() {
        if (!mounted) {
            return;
        }

        clearTimeout(mounted.searchTimer);
        mounted.search.removeEventListener("input", mounted.onSearchInput);
        mounted.page.removeEventListener("click", mounted.onPageClick);
        mounted = null;
    },
};
