#!/usr/bin/env -S deno run --allow-read --allow-run
// Text-size lint: every UI text size comes from the rem token scale.
//
// Scans the tracked .ts, .tsx and .css files under client/src and
// panther/_303_components and fails on an arbitrary Tailwind text size
// (`text-[10px]`), the non-token class `text-md`, or an inline font-size in
// px or pt. Canvas-rendered and document-rendered text is exempt below.
//
// Run: deno task lint:text-sizes

const ROOTS = ["client/src", "panther/_303_components"];

// Files whose text is a rendering of a document or a canvas, not UI, so a
// pixel size is the contract (PROTOCOL_ALL_SIZING.md).
const EXEMPT: Record<string, string> = {
  "client/src/components/products/report/fastr_theme_mock.tsx":
    "report theme miniature, drawn to a tile",
  "client/src/components/products/report/live_preview_extension.tsx":
    "the report page surface, pinned to its PDF's typography",
};

const ARBITRARY = /\btext-\[(\d+(\.\d+)?)(px|pt|rem|em)\]/g;
const TEXT_MD = /\btext-md\b/g;
const INLINE = /(?:font-size|fontSize)\s*["']?\s*[:=]\s*["'`]?\s*\d+(\.\d+)?(px|pt)\b/g;

type Hit = { file: string; line: number; message: string };

async function trackedFiles(): Promise<string[]> {
  const out = await new Deno.Command("git", {
    args: ["ls-files", "--", ...ROOTS],
    stdout: "piped",
  }).output();
  return new TextDecoder()
    .decode(out.stdout)
    .split("\n")
    .filter((f) => /\.(tsx?|css)$/.test(f));
}

function scan(file: string, text: string): Hit[] {
  const hits: Hit[] = [];
  text.split("\n").forEach((line, i) => {
    for (const [re, what] of [
      [ARBITRARY, "arbitrary text size"],
      [TEXT_MD, "`text-md` is not a token"],
      [INLINE, "inline font-size in a fixed unit"],
    ] as const) {
      for (const m of line.matchAll(re)) {
        hits.push({ file, line: i + 1, message: `${what}: ${m[0]}` });
      }
    }
  });
  return hits;
}

const hits: Hit[] = [];
for (const file of await trackedFiles()) {
  if (file in EXEMPT) continue;
  hits.push(...scan(file, await Deno.readTextFile(file)));
}
for (const h of hits) console.log(`${h.file}:${h.line}  ${h.message}`);
if (hits.length > 0) {
  console.error(`\nFAIL: ${hits.length} text size(s) outside the token scale.`);
  Deno.exit(1);
}
console.log("OK: every text size is a token.");
