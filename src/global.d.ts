import 'handlebars';

declare module 'handlebars' {
    interface HandlebarsTemplates {
        [key: string]: (data: any) => string;
    }
}

declare const Handlebars: {
    templates: Record<string, (data: any) => string>;
}