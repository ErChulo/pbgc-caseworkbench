import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      "@derived-catalog": fileURLToPath(
        new URL(
          "./references/data-dictionary/derived/catalog-v0.1.json",
          import.meta.url,
        ),
      ),
      "@dictionary-index": fileURLToPath(
        new URL(
          "./references/data-dictionary/derived/catalog-v1.0.json",
          import.meta.url,
        ),
      ),
    },
  },
  build: {
    target: "es2022",
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    sourcemap: false,
  },
  worker: {
    format: "es",
  },
  server: {
    host: "127.0.0.1",
  },
});

