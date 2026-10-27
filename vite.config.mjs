import { defineConfig } from "vite";
import legacy from "@vitejs/plugin-legacy";

export default defineConfig({
  publicDir: "public",
  plugins: [
    legacy({
      targets: ["defaults", "not IE 11"],
    }),
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
