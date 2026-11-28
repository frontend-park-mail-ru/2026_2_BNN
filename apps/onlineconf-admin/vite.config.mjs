import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import Handlebars from "handlebars";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  base: "/onlineconf/",
  publicDir: false,
  plugins: [
    {
      name: "onlineconf-templates",
      transform(source, id) {
        if (!id.endsWith(".hbs")) return;

        return {
          code: `import Handlebars from "handlebars/runtime";
export default Handlebars.template(${Handlebars.precompile(source)});`,
          map: null,
        };
      },
    },
    {
      name: "onlineconf-csp",
      apply: "build",
      transformIndexHtml() {
        return [
          {
            tag: "meta",
            attrs: {
              "http-equiv": "Content-Security-Policy",
              content:
                "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
            },
            injectTo: "head-prepend",
          },
        ];
      },
    },
  ],
  build: {
    outDir: path.resolve(root, "../../dist/onlineconf"),
    emptyOutDir: true,
  },
  server: {
    port: 3001,
    strictPort: true,
    fs: { allow: [path.resolve(root, "../..")] },
    proxy: { "/api": "http://localhost:5458" },
  },
  preview: {
    port: 3001,
    strictPort: true,
    proxy: { "/api": "http://localhost:5458" },
  },
});
