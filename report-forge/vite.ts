// A Vite plugin for hosts of Report Forge. It does two things a host would
// otherwise write by hand:
//
// - `report-forge` and `report-forge/styles.css` resolve to this folder,
//   wherever the host keeps it;
// - every package Report Forge imports resolves to the HOST's copy, and is
//   pre-bundled when the dev server starts. The package ships as source, so
//   without this a second copy of solid-js or CodeMirror could be picked up
//   from a node_modules beside it, or bundled a second time when the editor
//   first mounts, and two copies of either do not work together.
//
//   import { reportForge } from "./report-forge/vite.ts";
//   export default defineConfig({ plugins: [solid(), reportForge()] });

import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// What a host installs (package.json lists the versions).
export const REPORT_FORGE_DEPENDENCIES: string[] = [
  "@codemirror/commands",
  "@codemirror/lang-markdown",
  "@codemirror/language",
  "@codemirror/merge",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
  "codemirror",
  "docx",
  "dompurify",
  "markdown-it",
  "solid-js",
  "y-codemirror.next",
  "y-protocols",
  "yjs",
];

export function reportForge() {
  return {
    name: "report-forge",
    config() {
      return {
        resolve: {
          alias: [
            {
              find: /^report-forge\/styles\.css$/,
              replacement: path.join(here, "styles", "report-forge.css"),
            },
            {
              find: /^report-forge\/engine$/,
              replacement: path.join(here, "engine", "mod.ts"),
            },
            { find: /^report-forge$/, replacement: path.join(here, "mod.ts") },
          ],
          dedupe: REPORT_FORGE_DEPENDENCIES,
        },
        // Pre-bundle them when the dev server starts. The editor is usually
        // mounted late (when a document opens), and a dependency Vite first
        // meets at that moment makes it re-bundle mid-session: the page then
        // holds modules from before and after, and two copies of a package.
        optimizeDeps: {
          // y-protocols has no root entry; the editor uses its awareness.
          include: [
            ...REPORT_FORGE_DEPENDENCIES.filter((d) => d !== "y-protocols"),
            "solid-js/web",
            "y-protocols/awareness",
          ],
        },
      };
    },
  };
}
