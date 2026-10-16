/// <reference types="vite/client" />

interface HandlebarsTemplate {
  (context?: unknown): string;
}

declare const Handlebars: {
  templates: Record<string, HandlebarsTemplate>;
  partials: Record<string, HandlebarsTemplate>;
};
