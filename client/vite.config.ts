import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [solidPlugin(), tsconfigPaths(), tailwindcss()],
  resolve: {
    alias: {
      "@timroberton/panther": path.resolve(__dirname, "../panther/mod.ui.ts"),
      "solid-js": path.resolve(__dirname, "node_modules/solid-js"),
      "@solidjs/router": path.resolve(
        __dirname,
        "node_modules/@solidjs/router",
      ),
      sortablejs: path.resolve(__dirname, "node_modules/sortablejs"),
      "markdown-it": path.resolve(__dirname, "node_modules/markdown-it"),
      "@vscode/markdown-it-katex": path.resolve(__dirname, "node_modules/@vscode/markdown-it-katex"),
      katex: path.resolve(__dirname, "node_modules/katex"),
      docx: path.resolve(__dirname, "node_modules/docx"),
      jspdf: path.resolve(__dirname, "node_modules/jspdf"),
      papaparse: path.resolve(__dirname, "node_modules/papaparse"),
      zod: path.resolve(__dirname, "node_modules/zod"),
    },
  },
  server: {
    port: 3000,
  },
  optimizeDeps: {
    include: ["@uppy/tus", "@uppy/core", "@uppy/dashboard", "@uppy/xhr-upload"],
  },
  build: {
    target: "esnext",
  },
});
