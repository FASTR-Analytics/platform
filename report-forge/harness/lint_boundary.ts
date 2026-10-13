// Boundary lint: Report Forge imports nothing from the application around it.
// Every import in the package is either a relative path that stays inside
// the package, or one of the npm packages a host installs for it
// (DEPENDENCIES below, the same list the README gives a host). Anything else
// (an app alias, an app barrel, a path that climbs out) fails.
//
//   deno run --allow-read report-forge/harness/lint_boundary.ts

import { walk } from "@std/fs/walk";
import { dirname, fromFileUrl, relative, resolve } from "@std/path";

// What a host installs. The engine needs the first group; the editor adds
// the second; the collab seam the third; the Deno renderer the fourth.
export const DEPENDENCIES: readonly string[] = [
  "markdown-it",
  "docx",
  "dompurify",
  "solid-js",
  "codemirror",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/lang-markdown",
  "@codemirror/merge",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
  "@lezer/common",
  "@lezer/highlight",
  "pagedjs",
  "sortablejs",
  "yjs",
  "y-protocols",
  "y-codemirror.next",
  "@astral/astral",
];

// The harness and the playground are tools around the package, not part of
// what a host imports: they may use the Deno standard library and jszip.
const TOOLING_ONLY: readonly string[] = ["@std/", "jszip", "zod", "npm:jsdom"];
const TOOLING_DIRS = ["harness", "playground", "tests"];

const root = resolve(dirname(fromFileUrl(import.meta.url)), "..");
const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function allowedBare(spec: string, tooling: boolean): boolean {
  const hit = (name: string) => spec === name || spec.startsWith(`${name}/`);
  if (DEPENDENCIES.some(hit)) return true;
  if (tooling && TOOLING_ONLY.some((t) => spec.startsWith(t))) return true;
  return false;
}

const problems: string[] = [];
let files = 0;
for await (
  const entry of walk(root, {
    exts: [".ts", ".tsx"],
    skip: [/node_modules/, /\/dist\//],
  })
) {
  files++;
  const rel = relative(root, entry.path);
  const tooling = TOOLING_DIRS.some((d) => rel.startsWith(`${d}/`));
  const text = await Deno.readTextFile(entry.path);
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(
    /^\s*\/\/.*$/gm,
    "",
  );
  for (const m of code.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2];
    if (spec.startsWith(".")) {
      const target = resolve(dirname(entry.path), spec.replace(/\?.*$/, ""));
      if (relative(root, target).startsWith("..")) {
        problems.push(`${rel}: "${spec}" leaves the package`);
      }
      continue;
    }
    if (!allowedBare(spec, tooling)) {
      problems.push(`${rel}: "${spec}" is not a Report Forge dependency`);
    }
  }
}

if (problems.length > 0) {
  for (const p of problems) console.log(p);
  console.log(`\n${problems.length} import(s) cross the package boundary.`);
  Deno.exit(1);
}
console.log(`OK: ${files} files, no import crosses the package boundary.`);
