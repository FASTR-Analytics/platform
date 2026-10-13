// Boundary lint: Report Forge imports nothing from the application around it.
// Every import in the package is either a relative path that stays inside
// the package, or one of the npm packages a host installs for it
// (DEPENDENCIES below, the same list the README gives a host). Anything else
// (an app alias, an app barrel, a path that climbs out) fails.
//
//   deno run --allow-read report-forge/harness/lint_boundary.ts

import { walk } from "@std/fs/walk";
import { dirname, fromFileUrl, relative, resolve } from "@std/path";

// What a host installs (the same list as vite.ts and package.json), plus
// the browser launcher the Deno renderer in server/ uses.
export const DEPENDENCIES: readonly string[] = [
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
  "@astral/astral",
];

// The harness, the tests and the playground are tools around the package,
// not part of what a host imports: they may use the Deno standard library,
// a DOM for tests, Vite, and the package itself by its public name. The Vite
// plugin (vite.ts) runs in Node at build time.
const TOOLING_ONLY: readonly string[] = [
  "@std/",
  "jszip",
  "zod",
  "npm:jsdom",
  "vite",
  "report-forge",
];
const TOOLING_DIRS = ["harness", "playground", "tests"];
const NODE_BUILTIN_FILES = ["vite.ts"];

const root = resolve(dirname(fromFileUrl(import.meta.url)), "..");
const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function allowedBare(spec: string, tooling: boolean): boolean {
  const hit = (name: string) => spec === name || spec.startsWith(`${name}/`);
  if (DEPENDENCIES.some(hit)) return true;
  if (tooling && TOOLING_ONLY.some((t) => spec.startsWith(t))) return true;
  return false;
}

function allowedNodeBuiltin(spec: string, rel: string): boolean {
  return spec.startsWith("node:") && NODE_BUILTIN_FILES.includes(rel);
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
    if (!allowedBare(spec, tooling) && !allowedNodeBuiltin(spec, rel)) {
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
