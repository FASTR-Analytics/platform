#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
/**
 * build_help_buttons.ts — generates the help-button lookup table from the docs
 * site. Run with `deno task build:help-buttons`.
 *
 * Reads the sibling wb-fastr-site checkout (override with WB_FASTR_SITE_DIR),
 * finds every `<!-- help#id -->` tag, and for each derives:
 *   • anchor + title  ← the heading directly ABOVE the tag (slugified inline)
 *   • summary         ← the prose directly BELOW the tag (first ~200 chars)
 * English and French are coupled by the shared #id. Output:
 *   lib/help/help_targets.generated.ts   (committed — do NOT hand-edit)
 *
 * See DOC_HELP_BUTTONS.md (both repos) for the authoring contract.
 */

import { walk } from "@std/fs";
import { join, relative } from "@std/path";

const SITE_DIR = Deno.env.get("WB_FASTR_SITE_DIR") ?? "../wb-fastr-site";
const DOCS_EN = join(SITE_DIR, "src/content/docs");
const DOCS_FR = join(DOCS_EN, "fr");
const OUT = "lib/help/help_targets.generated.ts";
const SUMMARY_LEN = 200;

// --- slug + text helpers -------------------------------------------------

/**
 * GitHub/Starlight heading-anchor algorithm, inline (no dependency): lowercase,
 * strip punctuation but KEEP letters (incl. accents), digits and underscores,
 * spaces → hyphens, de-dupe repeats within a page (base, base-1, base-2…).
 */
function slugify(text: string, seen: Map<string, number>): string {
  const base = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_ -]+/gu, "")
    .trim()
    .replace(/ /g, "-");
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n === 0 ? base : `${base}-${n}`;
}

function stripInline(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .trim();
}

function plainText(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/^:::.*$/gm, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .replace(/^[>#\-*+]\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, n = SUMMARY_LEN): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

// --- markdown parsing ----------------------------------------------------

type Heading = { text: string; anchor: string; line: number };
type RawTag = { id: string; line: number };

function stripFrontmatter(s: string): string {
  if (!s.startsWith("---")) return s;
  const end = s.indexOf("\n---", 3);
  if (end === -1) return s;
  const after = s.indexOf("\n", end + 1);
  return after === -1 ? "" : s.slice(after + 1);
}

function parseDoc(content: string): { headings: Heading[]; tags: RawTag[]; lines: string[] } {
  const lines = stripFrontmatter(content).split("\n");
  const headings: Heading[] = [];
  const tags: RawTag[] = [];
  const seen = new Map<string, number>();
  let inFence = false;
  let fenceChar = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const ch = fence[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;

    const commentStart = line.indexOf("<!--");
    if (commentStart !== -1) {
      let end = i;
      let raw = line.slice(commentStart);
      while (!raw.includes("-->") && end + 1 < lines.length) {
        end++;
        raw += "\n" + lines[end];
      }
      const inner = raw.slice(4, raw.indexOf("-->")).trim();
      const m = inner.match(/^help#([a-z0-9][a-z0-9-]*)$/);
      if (m) tags.push({ id: m[1], line: i });
      else if (/^help#/.test(inner)) {
        throw new Error(`Malformed help tag (only "<!-- help#id -->" is allowed): <!-- ${inner} -->`);
      }
      i = end;
      continue;
    }

    const h = line.match(/^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/);
    if (h) {
      const text = stripInline(h[2]);
      headings.push({ text, anchor: slugify(text, seen), line: i });
    }
  }

  return { headings, tags, lines };
}

type Section = { id: string; anchor: string; title: string; summary: string };

function sectionsFor(content: string, where: string): Section[] {
  const { headings, tags, lines } = parseDoc(content);
  return tags.map((tag) => {
    let heading: Heading | undefined;
    let next: Heading | undefined;
    for (const h of headings) {
      if (h.line < tag.line) heading = h;
      else {
        next = h;
        break;
      }
    }
    if (!heading) {
      throw new Error(`Help tag "#${tag.id}" in ${where} is not under a heading.`);
    }
    const body = lines.slice(tag.line + 1, next ? next.line : undefined).join("\n");
    return { id: tag.id, anchor: heading.anchor, title: heading.text, summary: truncate(plainText(body)) };
  });
}

// --- pipeline ------------------------------------------------------------

function pageSlug(relPath: string): string {
  return relPath.replace(/\.md$/, "").replace(/\/index$/, "").replace(/^index$/, "");
}

async function readMaybe(path: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(path);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return null;
    throw e;
  }
}

type Target = {
  page: string;
  anchor: { en: string; fr: string };
  title: { en: string; fr: string };
  summary: { en: string; fr: string };
};

async function main() {
  const targets = new Map<string, Target>();

  for await (const entry of walk(DOCS_EN, { exts: [".md"], includeDirs: false })) {
    const rel = relative(DOCS_EN, entry.path);
    if (rel.startsWith("fr/") || rel.startsWith("fr\\")) continue; // FR handled per-page

    const enContent = await Deno.readTextFile(entry.path);
    const enSections = sectionsFor(enContent, rel);
    if (enSections.length === 0) continue;

    const slug = pageSlug(rel);
    const frPath = join(DOCS_FR, rel);
    const frContent = await readMaybe(frPath);
    if (frContent === null) {
      throw new Error(`${rel} has help tags but no French translation at fr/${rel}.`);
    }
    const frSections = sectionsFor(frContent, `fr/${rel}`);
    const frById = new Map(frSections.map((s) => [s.id, s]));

    for (const en of enSections) {
      if (targets.has(en.id)) {
        throw new Error(`Duplicate help id "#${en.id}" (ids must be globally unique).`);
      }
      const fr = frById.get(en.id);
      if (!fr) {
        throw new Error(`Help id "#${en.id}" is in ${rel} but missing in fr/${rel}.`);
      }
      targets.set(en.id, {
        page: slug,
        anchor: { en: en.anchor, fr: fr.anchor },
        title: { en: en.title, fr: fr.title },
        summary: { en: en.summary, fr: fr.summary },
      });
    }

    for (const fr of frSections) {
      if (!enSections.some((en) => en.id === fr.id)) {
        throw new Error(`Help id "#${fr.id}" is in fr/${rel} but missing in ${rel}.`);
      }
    }
  }

  const ids = [...targets.keys()].sort();
  const q = (s: string) => JSON.stringify(s);
  let out =
    "// GENERATED by `deno task build:help-buttons` — DO NOT EDIT.\n" +
    "// Source: wb-fastr-site help tags (<!-- help#id -->). See DOC_HELP_BUTTONS.md.\n\n" +
    'import type { HelpTarget } from "./types.ts";\n\n' +
    "export const HELP_TARGETS = {\n";
  for (const id of ids) {
    const t = targets.get(id)!;
    out += `  ${q(id)}: {\n`;
    out += `    page: ${q(t.page)},\n`;
    out += `    anchor: { en: ${q(t.anchor.en)}, fr: ${q(t.anchor.fr)} },\n`;
    out += `    title: { en: ${q(t.title.en)}, fr: ${q(t.title.fr)} },\n`;
    out += `    summary: { en: ${q(t.summary.en)}, fr: ${q(t.summary.fr)} },\n`;
    out += `  },\n`;
  }
  out += "} as const satisfies Record<string, HelpTarget>;\n\nexport type HelpId = keyof typeof HELP_TARGETS;\n";

  await Deno.mkdir("lib/help", { recursive: true });
  await Deno.writeTextFile(OUT, out);
  console.log(`✓ Wrote ${OUT} (${ids.length} help target${ids.length === 1 ? "" : "s"}).`);
}

await main();
