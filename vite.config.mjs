import { defineConfig } from "vite";
import legacy from "@vitejs/plugin-legacy";
import fs from "fs";

export default defineConfig({
  publicDir: "public",
  plugins: [
    legacy({
      targets: ["defaults", "not IE 11"],
    }),
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
