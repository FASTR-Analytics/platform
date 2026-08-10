
// Protocol compliance sweep for client/src — companion to ./validate_queries
// and ./validate_migrations. Checks the mechanically-verifiable rules from
// panther/protocols/PROTOCOL_UI_SOLIDJS.md and PROTOCOL_UI_STATE.md.
//
// Tier 1 (deterministic): a hit IS a violation — these fail the run.
// Tier 2 (heuristic): a hit needs review — reported, never fails the run.
// Rules needing semantic judgment (conditional returns, batch, Show-fallback
// peers) are not covered here; they belong to agent/human review.

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const ROOT = Deno.args[0] ?? `${SCRIPT_DIR}client/src`;

type Check = {
  id: string;
  tier: 1 | 2;
  rule: string;
  regex: RegExp;
  tsxOnly?: boolean;
};

const CHECKS: Check[] = [
  {
    id: "suspense-mechanism",
    tier: 1,
    rule: "SOLIDJS 5 — no createResource / Suspense / lazy / useTransition / createAsync",
    regex:
      /\bcreateResource\b|\bSuspense\b|\buseTransition\b|\bcreateAsync\b|(?<![.\w])lazy\(/,
  },
  {
    id: "destructured-props",
    tier: 1,
    rule: "SOLIDJS 2 — never destructure props",
    regex: /function [A-Z][A-Za-z]*\(\s*\{/,
    tsxOnly: true,
  },
  {
    id: "arrow-component",
    tier: 1,
    rule: "SOLIDJS 8 — components are function declarations",
    regex: /^(?:export )?const [A-Z][A-Za-z]* = \([^)]*\)(?::[^=]+)? =>/,
    tsxOnly: true,
  },
  {
    id: "props-not-p",
    tier: 1,
    rule: "SOLIDJS 7 — props parameter is named `p`",
    regex: /function [A-Z][A-Za-z]*\(props[,:)]/,
    tsxOnly: true,
  },
  {
    id: "jsx-and-and",
    tier: 2,
    rule: "SOLIDJS 6 — `cond && <JSX>` instead of <Show>",
    regex: /&& ?\(?</,
    tsxOnly: true,
  },
  {
    id: "jsx-map",
    tier: 2,
    rule: "SOLIDJS 6 — `.map` returning JSX instead of <For>",
    regex: /\.map\(\(?[\w{},: []]*\)? ?=> ?\(?\s*</,
    tsxOnly: true,
  },
  {
    id: "guard-before-deps",
    tier: 2,
    rule: "SOLIDJS 3 — effect opens with a guard before reading all deps",
    regex: /createEffect\((?:async )?\(\) => \{\s*\n\s*if \(/,
  },
  {
    id: "raw-loading-signal",
    tier: 2,
    rule: "STATE 8 — raw loading/error signals instead of StateHolder",
    regex: /const \[(?:is)?[Ll]oading|const \[(?:fetch|load)?[Ee]rror,/,
  },
];

type Hit = { file: string; line: number; text: string };
const hitsByCheck = new Map<string, Hit[]>();
for (const c of CHECKS) hitsByCheck.set(c.id, []);
const raceHits: Hit[] = [];

async function* walk(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      yield* walk(path);
    } else if (/\.tsx?$/.test(entry.name)) {
      yield path;
    }
  }
}

function findBlockEnd(s: string): number {
  const start = s.indexOf("{");
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === "{") depth++;
    if (s[i] === "}") depth--;
    if (depth === 0) return i + 1;
  }
  return s.length;
}

for await (const file of walk(ROOT)) {
  const text = await Deno.readTextFile(file);
  const lines = text.split("\n");
  const rel = file.replace(`${SCRIPT_DIR}`, "");

  for (const check of CHECKS) {
    if (check.tsxOnly && !file.endsWith(".tsx")) continue;
    if (check.id === "guard-before-deps") {
      for (const m of text.matchAll(new RegExp(check.regex, "g"))) {
        const line = text.slice(0, m.index).split("\n").length;
        hitsByCheck.get(check.id)!.push({
          file: rel,
          line,
          text: "effect body opens with a conditional",
        });
      }
      continue;
    }
    lines.forEach((lineText, i) => {
      if (check.regex.test(lineText)) {
        hitsByCheck.get(check.id)!.push({
          file: rel,
          line: i + 1,
          text: lineText.trim(),
        });
      }
    });
  }

  // STATE 11 — async effect writes state after await with no out-of-order guard
  for (const m of text.matchAll(/createEffect\(async \(\) => \{/g)) {
    const tail = text.slice(m.index);
    const block = tail.slice(0, findBlockEnd(tail));
    const afterAwait = block.slice(block.indexOf("await "));
    if (
      block.includes("await ") &&
      /set[A-Z]\w*\(/.test(afterAwait) &&
      !/requestId|thisRequest|runId|aborted|stale/i.test(block)
    ) {
      const line = text.slice(0, m.index).split("\n").length;
      raceHits.push({
        file: rel,
        line,
        text: "async effect writes state after await, no out-of-order guard",
      });
    }
  }
}

let tier1Total = 0;
let tier2Total = 0;

function report(tier: 1 | 2, id: string, rule: string, hits: Hit[]) {
  if (hits.length === 0) return;
  const label = tier === 1 ? "FAIL" : "REVIEW";
  console.log(`\n[${label}] ${id} — ${rule}: ${hits.length} hit(s)`);
  for (const h of hits) {
    console.log(`  ${h.file}:${h.line}  ${h.text.slice(0, 100)}`);
  }
}

for (const check of CHECKS) {
  const hits = hitsByCheck.get(check.id)!;
  if (check.tier === 1) tier1Total += hits.length;
  else tier2Total += hits.length;
  report(check.tier, check.id, check.rule, hits);
}
tier2Total += raceHits.length;
report(2, "async-effect-race", "STATE 11 — guard overlapping async effects", raceHits);

console.log("");
if (tier1Total > 0) {
  console.log("\x1b[91m╔══════════════════════════════════════════════════════════════╗");
  console.log("║                PROTOCOL VALIDATION FAILED                    ║");
  const msg = `${tier1Total} tier-1 violation(s); ${tier2Total} review flag(s)`;
  console.log(`║  ${msg.padEnd(60)}║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\x1b[0m");
  Deno.exit(1);
} else {
  console.log(
    `\x1b[92mPROTOCOL VALIDATION PASSED\x1b[0m — 0 tier-1 violations, ${tier2Total} tier-2 review flag(s)`,
  );
}
