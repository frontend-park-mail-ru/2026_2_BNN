import { defineConfig } from "vite";
import legacy from "@vitejs/plugin-legacy";
import crypto from "node:crypto";
import fs from "node:fs";

// В dev не ставится: Vite подключает свои скрипты и websocket.
// `unsafe-inline` у стилей нужен для `style="--tag-color"`.
// `data:` у скриптов нужен для проверки import.meta.resolve в @vitejs/plugin-legacy:
// адрес этого модуля содержит хеш бандла и меняется на каждой сборке, поэтому его
// нельзя закрепить sha256. Хеши обычных inline-скриптов считаются ниже по готовому HTML.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

function withInlineScriptHashes(html) {
  const hashes = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/(?:^|\s)src\s*=/i.test(match[1]) || match[2].length === 0) {
      continue;
    }
    const digest = crypto.createHash("sha256").update(match[2]).digest("base64");
    hashes.push(`'sha256-${digest}'`);
  }

  const policy = CONTENT_SECURITY_POLICY.map((directive) =>
    directive.startsWith("script-src ") ? `${directive} ${hashes.join(" ")}` : directive
  ).join("; ");

  return html.replace(
    /(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")/,
    `$1${policy}$2`
  );
}

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
        const meta = `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY.join("; ")}">`;
        return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${meta}`);
      },
      closeBundle() {
        const file = "dist/index.html";
        fs.writeFileSync(file, withInlineScriptHashes(fs.readFileSync(file, "utf8")));
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
