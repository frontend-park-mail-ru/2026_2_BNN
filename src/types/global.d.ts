interface HandlebarsTemplate {
  (context?: unknown): string;
}

declare const Handlebars: {
  templates: Record<string, HandlebarsTemplate>;
  partials: Record<string, HandlebarsTemplate>;
  SafeString: new (html: string) => { toString(): string };
  registerHelper: (name: string, helper: (...args: never[]) => unknown) => void;
};
