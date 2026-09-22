#!/usr/bin/env -S deno run --allow-read
// Structure lint for the client tree (panther/protocols/PROTOCOL_UI_STRUCTURE.md).
//
// Resolves every import under client/src the way client/tsconfig.json does
// (`~/` is client/src, relative paths, extensionless specifiers, folder
// index.ts(x) and mod.ts) and checks the nine rules of the protocol's
// checklist. Bare specifiers (lib, panther, npm packages) are external and
// ignored. An optional directory argument narrows which files are reported;
// imports are always resolved across the whole client.
//
// Run: deno task lint:structure [dir]

import { existsSync } from "@std/fs/exists";
import { walkSync } from "@std/fs/walk";
import { dirname, join, relative, resolve } from "@std/path";

export type CheckId =
  | "root-file"
  | "snake-case"
  | "index-entry"
  | "entry-only"
  | "shared-scope"
  | "shared-consumers"
  | "direction"
  | "unimported"
  | "entry-cycle";

export const CHECK_IDS: readonly CheckId[] = [
  "root-file",
  "snake-case",
  "index-entry",
  "entry-only",
  "shared-scope",
  "shared-consumers",
  "direction",
  "unimported",
  "entry-cycle",
];

export type Hit = { check: CheckId; file: string; line: number; message: string };

type Edge = {
  from: string;
  to: string;
  line: number;
  typeOnly: boolean;
  names: string[];
  namespace: boolean;
};

type Statement = { text: string; line: number };

type ReExport = { name: string; source: string };

const COMPONENTS = "components";
const ROOTS = ["app.tsx", "index.tsx"];
const ROOT_DIRS = ["routes"];
const LOWER_LAYERS = ["state", "exports"];
const SEGMENT = /^[a-z0-9]+(_[a-z0-9]+)*$/;

function isUnder(file: string, dir: string): boolean {
  return dir === "." || file === dir || file.startsWith(dir + "/");
}

function isGenerator(file: string): boolean {
  return file.startsWith("generate_");
}

function basename(file: string): string {
  return file.slice(file.lastIndexOf("/") + 1);
}

function folderOf(file: string): string {
  return dirname(file);
}

function topStatements(text: string): Statement[] {
  const lines = text.split("\n");
  const out: Statement[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^(import|export)\b/.test(line)) {
      const start = i;
      let stmt = line;
      const isReExport = /^export\s+(type\s+)?[{*]/.test(line) || /^import\b/.test(line);
      if (isReExport) {
        let guard = 0;
        while (!statementComplete(stmt) && i + 1 < lines.length && guard++ < 400) {
          i++;
          stmt += "\n" + lines[i];
        }
      }
      out.push({ text: stmt, line: start + 1 });
    }
    i++;
  }
  return out;
}

function bracesBalanced(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
  }
  return depth <= 0;
}

function statementComplete(stmt: string): boolean {
  if (!bracesBalanced(stmt)) return false;
  if (/from\s*["'][^"']+["']/.test(stmt)) return true;
  if (/^import\s*["'][^"']+["']/.test(stmt)) return true;
  if (/^export\s+(type\s+)?\{[\s\S]*\}/.test(stmt) && !/\}\s*$/.test(stmt.trimEnd())) return true;
  return /^export\s+(type\s+)?\{[\s\S]*\}\s*;?\s*$/.test(stmt);
}

function specifierOf(stmt: string): string | null {
  const from = stmt.match(/from\s*["']([^"']+)["']/);
  if (from) return from[1];
  const side = stmt.match(/^import\s*["']([^"']+)["']/);
  return side ? side[1] : null;
}

function braceList(stmt: string): string[] {
  const m = stmt.match(/\{([\s\S]*?)\}/);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isTypeOnly(stmt: string): boolean {
  if (/^(import|export)\s+type\b/.test(stmt)) return true;
  const items = braceList(stmt);
  const hasDefaultOrNamespace = /^import\s+(\w+|\*\s+as\s+\w+)\s*(,|from)/.test(stmt);
  return items.length > 0 && !hasDefaultOrNamespace && items.every((s) => /^type\s/.test(s));
}

function importedNames(stmt: string): { names: string[]; namespace: boolean } {
  const names: string[] = [];
  const def = stmt.match(/^import\s+(type\s+)?([A-Za-z_$][\w$]*)\s*(,|from)/);
  if (def) names.push("default");
  const namespace = /\*\s+as\s+\w+/.test(stmt);
  for (const item of braceList(stmt)) {
    const m = item.match(/^(?:type\s+)?([\w$]+|default)(?:\s+as\s+[\w$]+)?$/);
    if (m) names.push(m[1]);
  }
  if (/^export\s+\*\s+from/.test(stmt)) return { names: [], namespace: true };
  return { names, namespace };
}

function reExportsOf(stmt: string): ReExport[] | "all" | null {
  if (!/^export\b/.test(stmt)) return null;
  const spec = specifierOf(stmt);
  if (!spec) return null;
  if (/^export\s+\*\s+from/.test(stmt)) return "all";
  const star = stmt.match(/^export\s+\*\s+as\s+([\w$]+)\s+from/);
  if (star) return [{ name: star[1], source: spec }];
  return braceList(stmt).flatMap((item) => {
    const m = item.match(/^(?:type\s+)?([\w$]+|default)(?:\s+as\s+([\w$]+))?$/);
    return m ? [{ name: m[2] ?? m[1], source: spec }] : [];
  });
}

function localExportNames(stmt: string): string[] {
  if (specifierOf(stmt) !== null || !/^export\b/.test(stmt)) return [];
  const decl = stmt.match(
    /^export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|class|const|let|var|type|interface|enum|namespace)\s+([\w$]+)/,
  );
  if (decl) return /^export\s+default\b/.test(stmt) ? ["default"] : [decl[1]];
  if (/^export\s+default\b/.test(stmt)) return ["default"];
  return braceList(stmt).flatMap((item) => {
    const m = item.match(/^(?:type\s+)?([\w$]+)(?:\s+as\s+([\w$]+|default))?$/);
    return m ? [m[2] ?? m[1]] : [];
  });
}

class ClientTree {
  readonly files: string[];
  readonly edges: Edge[] = [];
  private readonly statements = new Map<string, Statement[]>();
  private readonly exportCache = new Map<string, Map<string, string>>();

  constructor(readonly srcDir: string) {
    this.files = [...walkSync(srcDir, { includeDirs: false, exts: [".ts", ".tsx"] })]
      .map((e) => relative(srcDir, e.path))
      .filter((f) => !f.endsWith(".d.ts") && !f.split("/").includes("node_modules"))
      .sort();
    for (const file of this.files) {
      const text = Deno.readTextFileSync(join(srcDir, file));
      const stmts = topStatements(text);
      this.statements.set(file, stmts);
      for (const stmt of stmts) {
        const spec = specifierOf(stmt.text);
        if (spec === null) continue;
        const to = this.resolve(spec, file, stmt.line);
        if (to === null) continue;
        const { names, namespace } = importedNames(stmt.text);
        this.edges.push({ from: file, to, line: stmt.line, typeOnly: isTypeOnly(stmt.text), names, namespace });
      }
      for (const m of text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
        const to = this.resolve(m[1], file, 0);
        if (to === null) continue;
        const line = text.slice(0, m.index).split("\n").length;
        this.edges.push({ from: file, to, line, typeOnly: false, names: [], namespace: true });
      }
    }
  }

  resolve(spec: string, from: string, line: number): string | null {
    let base: string;
    if (spec.startsWith("~/")) base = spec.slice(2);
    else if (spec.startsWith("./") || spec.startsWith("../")) base = join(folderOf(from), spec);
    else return null;
    base = base.replace(/^\.\//, "");
    if (base.startsWith("../")) return null;
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, `${base}/mod.ts`]) {
      if (this.isFile(candidate)) return candidate;
    }
    if (existsSync(join(this.srcDir, base), { isFile: true })) return null;
    throw new Error(`${from}:${line} cannot resolve import "${spec}"`);
  }

  private isFile(rel: string): boolean {
    return (rel.endsWith(".ts") || rel.endsWith(".tsx")) && this.files.includes(rel);
  }

  // Every exported name of a file mapped to the file that declares it, with
  // `export *` and `export { } from` followed through.
  exportTable(file: string, seen: Set<string> = new Set()): Map<string, string> {
    const cached = this.exportCache.get(file);
    if (cached) return cached;
    const table = new Map<string, string>();
    if (seen.has(file)) return table;
    seen.add(file);
    for (const stmt of this.statements.get(file) ?? []) {
      for (const name of localExportNames(stmt.text)) table.set(name, file);
      const re = reExportsOf(stmt.text);
      if (re === null) continue;
      const spec = specifierOf(stmt.text);
      const source = spec === null ? null : this.resolve(spec, file, stmt.line);
      if (source === null) continue;
      if (re === "all") {
        for (const [name, origin] of this.exportTable(source, seen)) {
          if (name !== "default") table.set(name, origin);
        }
      } else {
        const inner = this.exportTable(source, seen);
        for (const { name, source: _ } of re) {
          const origin = /^export\s+\*\s+as/.test(stmt.text) ? source : (inner.get(name) ?? source);
          table.set(name, origin);
        }
      }
    }
    this.exportCache.set(file, table);
    return table;
  }
}

function checkNames(tree: ClientTree): Hit[] {
  const hits: Hit[] = [];
  const seenFolders = new Set<string>();
  for (const file of tree.files) {
    if (!isUnder(file, COMPONENTS)) continue;
    const parts = file.split("/").slice(1);
    const name = parts[parts.length - 1];
    if (folderOf(file) === COMPONENTS) {
      hits.push({ check: "root-file", file, line: 1, message: "a file at the root of components/; only areas live there" });
    }
    if (/^index\.tsx?$/.test(name)) {
      hits.push({ check: "index-entry", file, line: 1, message: "index.ts(x) is banned; the entry is mod.ts" });
    }
    const stem = name.replace(/\.tsx?$/, "");
    if (!SEGMENT.test(stem)) {
      hits.push({ check: "snake-case", file, line: 1, message: `file name "${name}" is not snake_case` });
    }
    let folder = COMPONENTS;
    for (const segment of parts.slice(0, -1)) {
      folder = `${folder}/${segment}`;
      if (seenFolders.has(folder)) continue;
      seenFolders.add(folder);
      if (segment !== "_shared" && !SEGMENT.test(segment)) {
        hits.push({ check: "snake-case", file: `${folder}/`, line: 1, message: `folder name "${segment}" is not snake_case` });
      }
    }
  }
  return hits;
}

function sharedRootOf(file: string): string | null {
  const parts = file.split("/");
  const i = parts.indexOf("_shared");
  return i === -1 ? null : parts.slice(0, i).join("/");
}

function checkEdges(tree: ClientTree): Hit[] {
  const hits: Hit[] = [];
  for (const e of tree.edges) {
    const toComponents = isUnder(e.to, COMPONENTS);
    if (toComponents && folderOf(e.from) !== folderOf(e.to) && basename(e.to) !== "mod.ts") {
      hits.push({ check: "entry-only", file: e.from, line: e.line, message: `imports ${e.to}; another folder is imported only through its mod.ts` });
    }
    if (toComponents) {
      const root = sharedRootOf(e.to);
      if (root !== null && !isUnder(e.from, root)) {
        hits.push({ check: "shared-scope", file: e.from, line: e.line, message: `imports ${e.to}; ${root}/_shared/ is importable only from under ${root}/` });
      }
    }
    const fromLower = LOWER_LAYERS.some((d) => isUnder(e.from, d)) || isGenerator(e.from);
    if (fromLower && toComponents) {
      hits.push({ check: "direction", file: e.from, line: e.line, message: `imports ${e.to}; nothing below components/ imports it` });
    }
    if (isGenerator(e.from) && isUnder(e.to, "exports")) {
      hits.push({ check: "direction", file: e.from, line: e.line, message: `imports ${e.to}; a generator never imports an exporter` });
    }
  }
  return hits;
}

// The children of a `_shared/` folder that an edge into it consumes: the
// child the target sits under, or, for an import of the folder's own mod.ts,
// the children whose exports the importer names.
function consumedChildren(tree: ClientTree, shared: string, e: Edge): string[] {
  const childOf = (file: string): string | null => {
    if (!isUnder(file, shared) || file === `${shared}/mod.ts`) return null;
    return file.slice(shared.length + 1).split("/")[0];
  };
  if (e.to !== `${shared}/mod.ts`) {
    const child = childOf(e.to);
    return child === null ? [] : [child];
  }
  const table = tree.exportTable(e.to);
  const origins = e.namespace ? [...table.values()] : e.names.flatMap((n) => {
    const origin = table.get(n);
    return origin === undefined ? [] : [origin];
  });
  return [...new Set(origins.flatMap((o) => {
    const child = childOf(o);
    return child === null ? [] : [child];
  }))];
}

// A child of `_shared/` needs two distinct consuming children of the parent.
// A consumer inside the same `_shared/` folder lends its own consumers: a
// helper used only by a shared file is as shared as that file.
function checkSharedConsumers(tree: ClientTree): Hit[] {
  const hits: Hit[] = [];
  const sharedFolders = new Set<string>();
  for (const file of tree.files) {
    if (!isUnder(file, COMPONENTS)) continue;
    const parts = file.split("/");
    parts.forEach((p, i) => {
      if (p === "_shared") sharedFolders.add(parts.slice(0, i + 1).join("/"));
    });
  }
  for (const shared of [...sharedFolders].sort()) {
    const parent = dirname(shared);
    const childOf = (file: string): string => file.slice(shared.length + 1).split("/")[0];
    const children = new Set(tree.files.filter((f) => isUnder(f, shared) && f !== `${shared}/mod.ts`).map(childOf));
    const external = new Map([...children].map((c) => [c, new Set<string>()]));
    const internal = new Map([...children].map((c) => [c, new Set<string>()]));
    for (const e of tree.edges) {
      if (!isUnder(e.to, shared) || !isUnder(e.from, parent) || e.from === `${shared}/mod.ts`) continue;
      const inside = isUnder(e.from, shared);
      const rest = e.from.slice(parent.length + 1);
      const consumer = rest.includes("/") ? rest.split("/")[0] : ".";
      for (const child of consumedChildren(tree, shared, e)) {
        if (inside && childOf(e.from) === child) continue;
        if (inside) internal.get(child)?.add(childOf(e.from));
        else external.get(child)?.add(consumer);
      }
    }
    const effective = new Map([...children].map((c) => [c, new Set(external.get(c))]));
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of children) {
        const mine = effective.get(c)!;
        for (const i of internal.get(c)!) {
          for (const x of effective.get(i) ?? []) {
            if (!mine.has(x)) {
              mine.add(x);
              grew = true;
            }
          }
        }
      }
    }
    for (const child of [...children].sort()) {
      const consumers = effective.get(child)!;
      if (consumers.size >= 2) continue;
      const path = `${shared}/${child}`;
      const file = tree.files.includes(path) ? path : `${path}/`;
      const who = consumers.size === 0 ? "no consumer" : `one consumer (${[...consumers][0]})`;
      hits.push({ check: "shared-consumers", file, line: 1, message: `${who} under ${parent}/; _shared/ needs two or more distinct children` });
    }
  }
  return hits;
}

function checkUnimported(tree: ClientTree): Hit[] {
  const reached = new Set<string>();
  const stack = tree.files.filter((f) => ROOTS.includes(f) || ROOT_DIRS.some((d) => isUnder(f, d)));
  const out = new Map<string, string[]>();
  for (const e of tree.edges) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  while (stack.length > 0) {
    const f = stack.pop()!;
    if (reached.has(f)) continue;
    reached.add(f);
    for (const t of out.get(f) ?? []) stack.push(t);
  }
  return tree.files
    .filter((f) => !reached.has(f))
    .map((f) => ({ check: "unimported" as const, file: f, line: 1, message: "not reachable from app.tsx or routes/; delete it or import it" }));
}

function checkEntryCycles(tree: ClientTree, scope: string): Hit[] {
  const adj = new Map<string, { to: string; file: string; line: number }[]>();
  for (const e of tree.edges) {
    if (e.typeOnly || !isUnder(e.to, COMPONENTS) || basename(e.to) !== "mod.ts") continue;
    const a = folderOf(e.from);
    const b = folderOf(e.to);
    if (a === b) continue;
    adj.set(a, [...(adj.get(a) ?? []), { to: b, file: e.from, line: e.line }]);
  }
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let counter = 0;
  const strongConnect = (v: string): void => {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const { to } of adj.get(v) ?? []) {
      if (!index.has(to)) {
        strongConnect(to);
        low.set(v, Math.min(low.get(v)!, low.get(to)!));
      } else if (onStack.has(to)) {
        low.set(v, Math.min(low.get(v)!, index.get(to)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      sccs.push(scc);
    }
  };
  for (const v of [...adj.keys()].sort()) if (!index.has(v)) strongConnect(v);

  const hits: Hit[] = [];
  for (const scc of sccs) {
    if (scc.length < 2) continue;
    const members = new Set(scc);
    const inScope = scc.filter((f) => isUnder(f, scope)).sort();
    if (inScope.length === 0) continue;
    const edges = scc
      .flatMap((a) => (adj.get(a) ?? []).filter((x) => members.has(x.to)).map((x) => ({ from: a, ...x })))
      .sort((x, y) => x.file.localeCompare(y.file) || x.line - y.line);
    const first = edges.find((x) => isUnder(x.from, scope)) ?? edges[0];
    const listed = edges.slice(0, 12).map((x) => `${x.file}:${x.line} -> ${x.to}/mod.ts`).join("; ");
    hits.push({
      check: "entry-cycle",
      file: first.file,
      line: first.line,
      message: `runtime cycle between ${scc.sort().join(", ")} via ${listed}${edges.length > 12 ? "; ..." : ""}`,
    });
  }
  return hits;
}

function inScope(hit: Hit, scope: string): boolean {
  return hit.check === "entry-cycle" || isUnder(hit.file.replace(/\/$/, ""), scope);
}

export function lintStructure(srcDir: string, scope = "."): Hit[] {
  const tree = new ClientTree(srcDir);
  const hits = [
    ...checkNames(tree),
    ...checkEdges(tree),
    ...checkSharedConsumers(tree),
    ...checkUnimported(tree),
    ...checkEntryCycles(tree, scope),
  ].filter((h) => inScope(h, scope));
  return hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.check.localeCompare(b.check));
}

if (import.meta.main) {
  const root = new URL("./", import.meta.url).pathname;
  const srcDir = join(root, "client/src");
  const arg = Deno.args[0];
  let scope = ".";
  if (arg !== undefined) {
    const abs = resolve(arg);
    const rel = relative(srcDir, abs);
    if (rel.startsWith("..") || !existsSync(abs, { isDirectory: true })) {
      console.error(`Scope must be a directory under client/src: ${arg}`);
      Deno.exit(2);
    }
    scope = rel === "" ? "." : rel;
  }
  const hits = lintStructure(srcDir, scope);
  for (const h of hits) console.log(`${h.file}:${h.line}  ${h.check}  ${h.message}`);
  const counts = CHECK_IDS.map((id) => `${id.padStart(17)}  ${hits.filter((h) => h.check === id).length}`);
  console.log(`\nScope: ${scope === "." ? "client/src" : `client/src/${scope}`}\n${counts.join("\n")}`);
  if (hits.length > 0) {
    console.error(`\nFAIL: ${hits.length} hit(s).`);
    Deno.exit(1);
  }
  console.log("\nOK: the tree follows PROTOCOL_UI_STRUCTURE.");
}
