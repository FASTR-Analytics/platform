#!/usr/bin/env -S deno run --allow-read --allow-run
// Systems-topology manifest lint (PLAN_SYSTEMS.md / PLAN_DOC_CONSOLIDATION.md).
//
// Reads the `globs:` frontmatter from every SYSTEM_NN_*.md at the repo root
// (SYSTEM_00_kernel.md holds the read-but-don't-own kernel files) and asserts
// that every tracked .ts/.tsx file under server/, lib/, client/src/ (+ main.ts)
// matches exactly ONE system. Reports orphans (0 systems) and double-claims
// (>1). Custody files (PLAN_SYSTEMS §4.1) are single-owner by construction, so
// they must never double-claim — their multi-system nature lives in prose.
//
// Run: deno run --allow-read --allow-run lint_systems.ts

import { globToRegExp } from "jsr:@std/path@^1/glob-to-regexp";

const ROOT = new URL("./", import.meta.url).pathname;

type SystemDef = { id: string; name: string; file: string; patterns: RegExp[] };

function parseFrontmatter(text: string): {
  system?: string;
  name?: string;
  globs: string[];
  docs_absorbed: string[];
} {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const globs: string[] = [];
  const docs: string[] = [];
  if (!m) return { globs, docs_absorbed: docs };
  const lines = m[1].split("\n");
  let key: string | null = null;
  let system: string | undefined;
  let name: string | undefined;
  for (const raw of lines) {
    const listItem = raw.match(/^\s*-\s+(.+?)\s*$/);
    const topKey = raw.match(/^(\w[\w-]*):\s*(.*)$/);
    if (listItem && key === "globs") {
      globs.push(listItem[1].replace(/^["']|["']$/g, ""));
      continue;
    }
    if (listItem && key === "docs_absorbed") {
      docs.push(listItem[1].replace(/^["']|["']$/g, ""));
      continue;
    }
    if (topKey) {
      key = topKey[1];
      const val = topKey[2].trim();
      if (key === "system") system = val.replace(/^["']|["']$/g, "");
      else if (key === "name") name = val.replace(/^["']|["']$/g, "");
      else if (key !== "globs" && key !== "docs_absorbed") key = null;
    }
  }
  return { system, name, globs, docs_absorbed: docs };
}

function toRegex(glob: string): RegExp {
  return globToRegExp(glob, { globstar: true, extended: true });
}

async function loadSystems(): Promise<SystemDef[]> {
  const defs: SystemDef[] = [];
  for await (const entry of Deno.readDir(ROOT)) {
    if (!entry.isFile) continue;
    if (!/^SYSTEM_\d\d.*\.md$/.test(entry.name)) continue;
    const text = await Deno.readTextFile(ROOT + entry.name);
    const fm = parseFrontmatter(text);
    if (!fm.globs.length) {
      console.warn(`  (warning) ${entry.name} has no globs:`);
    }
    defs.push({
      id: fm.system ?? entry.name,
      name: fm.name ?? entry.name,
      file: entry.name,
      patterns: fm.globs.map(toRegex),
    });
  }
  defs.sort((a, b) => a.file.localeCompare(b.file));
  return defs;
}

async function trackedFiles(): Promise<string[]> {
  const cmd = new Deno.Command("git", {
    args: [
      "-C",
      ROOT,
      "ls-files",
      "server/**/*.ts",
      "server/**/*.tsx",
      "lib/**/*.ts",
      "lib/**/*.tsx",
      "client/src/**/*.ts",
      "client/src/**/*.tsx",
      "server/*.ts",
      "lib/*.ts",
      "client/src/*.ts",
      "client/src/*.tsx",
      "main.ts",
    ],
    stdout: "piped",
  });
  const { stdout } = await cmd.output();
  return new TextDecoder()
    .decode(stdout)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.endsWith(".d.ts"));
}

function ownersOf(file: string, systems: SystemDef[]): SystemDef[] {
  return systems.filter((s) => s.patterns.some((p) => p.test(file)));
}

const systems = await loadSystems();
const files = await trackedFiles();

if (!systems.length) {
  console.error("No SYSTEM_NN_*.md files found at repo root.");
  Deno.exit(2);
}

const orphans: string[] = [];
const doubles: { file: string; owners: string[] }[] = [];
const perSystem = new Map<string, number>();

for (const file of files) {
  const owners = ownersOf(file, systems);
  if (owners.length === 0) orphans.push(file);
  else if (owners.length > 1)
    doubles.push({ file, owners: owners.map((o) => `${o.id} (${o.file})`) });
  else perSystem.set(owners[0].id, (perSystem.get(owners[0].id) ?? 0) + 1);
}

console.log(`Systems: ${systems.length}   Tracked files: ${files.length}\n`);
console.log("Files per system:");
for (const s of systems) {
  console.log(`  ${s.id.padStart(8)}  ${perSystem.get(s.id) ?? 0}  ${s.name}`);
}
console.log();

if (orphans.length) {
  console.log(`ORPHANS (${orphans.length}) — claimed by no system:`);
  for (const f of orphans) console.log(`  ${f}`);
  console.log();
}
if (doubles.length) {
  console.log(`DOUBLE-CLAIMS (${doubles.length}) — fix the globs:`);
  for (const d of doubles) console.log(`  ${d.file}  ->  ${d.owners.join(", ")}`);
  console.log();
}

if (orphans.length || doubles.length) {
  console.error(
    `FAIL: ${orphans.length} orphan(s), ${doubles.length} double-claim(s).`,
  );
  Deno.exit(1);
}
console.log("OK: every tracked file is claimed by exactly one system.");
