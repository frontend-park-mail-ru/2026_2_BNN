import { defineConfig } from "vite";
import legacy from "@vitejs/plugin-legacy";
import fs from "fs";

// В dev не ставится: Vite подключает свои скрипты и websocket.
// `unsafe-inline` у стилей нужен для `style="--tag-color"`.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export default defineConfig({
  publicDir: "public",
  plugins: [
    legacy({
      targets: ["defaults", "not IE 11"],
    }),
    {
      name: "content-security-policy",
      apply: "build",
      transformIndexHtml(html) {
        const meta = `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`;
        return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${meta}`);
      },
    },
    {
      name: "stamp-sw",
      apply: "build",
      closeBundle() {
        const source = fs.readFileSync("dist/sw.js", "utf8");
        fs.writeFileSync("dist/sw.js", source.replace("bnn-static-v1", `bnn-static-${Date.now()}`));
      },
    },
  ],
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:5458",
      "/avatars": "http://localhost:9002",
    },
  },
  preview: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:5458",
      "/avatars": "http://localhost:9002",
    },
  },
});
