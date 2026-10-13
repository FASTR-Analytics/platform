// A Vite plugin for hosts of Report Forge. It does two things a host would
// otherwise write by hand:
//
// - `report-forge` and `report-forge/styles.css` resolve to this folder,
//   wherever the host keeps it;
// - every package Report Forge imports resolves to the HOST's copy. The
//   package ships as source, so without this a second copy of solid-js or
//   CodeMirror could be picked up from a node_modules beside it, and two
//   copies of either do not work together.
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
  "@lezer/common",
  "@lezer/highlight",
  "codemirror",
  "docx",
  "dompurify",
  "markdown-it",
  "pagedjs",
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
      };
    },
  };
}
