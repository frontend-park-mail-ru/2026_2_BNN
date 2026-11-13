import { defineConfig } from "vite";
import legacy from "@vitejs/plugin-legacy";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// В dev не ставится: Vite подключает свои скрипты и websocket.
// Скрипты и стили только со своего хоста. data: оставлен картинкам (SVG-фильтр и QR),
// не скриптам: проверку import.meta.resolve сборка выносит в обычный файл.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

const DATA_SCRIPT = "data:text/javascript,";

function walkFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function findDataScripts(source) {
  const found = [];
  let from = 0;
  while (from < source.length) {
    const start = source.indexOf(DATA_SCRIPT, from);
    if (start === -1) {
      break;
    }
    const quote = source[start - 1];
    if (quote !== "'" && quote !== '"') {
      from = start + DATA_SCRIPT.length;
      continue;
    }
    let end = start + DATA_SCRIPT.length;
    while (end < source.length) {
      if (source[end] === "\\") {
        end += 2;
        continue;
      }
      if (source[end] === quote) {
        break;
      }
      end += 1;
    }
    if (end >= source.length) {
      break;
    }
    found.push({ start, end, raw: source.slice(start, end) });
    from = end + 1;
  }
  return found;
}

function writeAsset(assetDir, body) {
  const hash = crypto.createHash("sha256").update(body).digest("hex").slice(0, 12);
  const name = `csp-${hash}.js`;
  fs.writeFileSync(path.join(assetDir, name), body);
  return `/assets/${name}`;
}

function externalizeDataScripts(files, assetDir) {
  const bodies = new Map();
  const locations = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const matches = findDataScripts(source);
    if (matches.length === 0) {
      continue;
    }
    locations.push({ file, source, matches });
    for (const match of matches) {
      if (!bodies.has(match.raw)) {
        const encoded = match.raw.slice(DATA_SCRIPT.length);
        bodies.set(
          match.raw,
          encoded.replace(/\\(.)/g, (_match, char) => char)
        );
      }
    }
  }

  const paths = new Map();
  for (const [raw, body] of bodies) {
    paths.set(raw, writeAsset(assetDir, body));
  }

  for (const location of locations) {
    let next = "";
    let cursor = 0;
    for (const match of location.matches) {
      next += location.source.slice(cursor, match.start) + paths.get(match.raw);
      cursor = match.end;
    }
    fs.writeFileSync(location.file, next + location.source.slice(cursor));
  }
}

function externalizeInlineScripts(html, assetDir) {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs, body) => {
    if (/(?:^|\s)src\s*=/i.test(attrs) || body.length === 0) {
      return full;
    }
    return `<script${attrs} src="${writeAsset(assetDir, body)}"></script>`;
  });
}

function policyFor(html, distDir) {
  const inline = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/(?:^|\s)src\s*=/i.test(match[1]) || match[2].length === 0) {
      continue;
    }
    const digest = crypto.createHash("sha256").update(match[2]).digest("base64");
    inline.push(`'sha256-${digest}'`);
  }
  const needsData = walkFiles(distDir).some(
    (file) => file.endsWith(".js") && fs.readFileSync(file, "utf8").includes(DATA_SCRIPT)
  );
  return CONTENT_SECURITY_POLICY.map((directive) => {
    if (!directive.startsWith("script-src ") || (!needsData && inline.length === 0)) {
      return directive;
    }
    return `${directive}${needsData ? " data:" : ""} ${inline.join(" ")}`.trim();
  }).join("; ");
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
        const distDir = "dist";
        const assetDir = path.join(distDir, "assets");
        const htmlFile = path.join(distDir, "index.html");
        const sources = [htmlFile, ...walkFiles(assetDir).filter((file) => file.endsWith(".js"))];
        externalizeDataScripts(sources, assetDir);
        const html = externalizeInlineScripts(fs.readFileSync(htmlFile, "utf8"), assetDir);
        const policy = policyFor(html, distDir);
        fs.writeFileSync(
          htmlFile,
          html.replace(
            /(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")/,
            `$1${policy}$2`
          )
        );
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
