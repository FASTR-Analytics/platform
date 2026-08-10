
// Protocol compliance sweep for client/src — companion to ./validate_queries
// and ./validate_migrations. Checks the mechanically-verifiable rules from
// panther/protocols/PROTOCOL_UI_SOLIDJS.md and PROTOCOL_UI_STATE.md.
//
// Tier 1 (deterministic): a hit IS a violation — these fail the run.
// Tier 2 (heuristic): a hit needs review — reported, never fails the run.
// Reviewed-and-accepted tier-2 hits live in validate_protocols_baseline.json
// (keyed by rule + file + matched text, line-number-insensitive) and are
// suppressed; only NEW hits print. Regenerate with --update-baseline after
// reviewing; delete an entry to re-arm that check.
// Rules needing semantic judgment (conditional returns, batch, Show-fallback
// peers) are not covered here; they belong to agent/human review.

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const POSITIONAL = Deno.args.filter((a) => !a.startsWith("--"));
const ROOT = POSITIONAL[0] ?? `${SCRIPT_DIR}client/src`;
const UPDATE_BASELINE = Deno.args.includes("--update-baseline");
const BASELINE_PATH = `${SCRIPT_DIR}validate_protocols_baseline.json`;

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

type BaselineEntry = { id: string; file: string; text: string };

const tier2Groups: Array<{ id: string; rule: string; hits: Hit[] }> = CHECKS
  .filter((c) => c.tier === 2)
  .map((c) => ({ id: c.id, rule: c.rule, hits: hitsByCheck.get(c.id)! }));
tier2Groups.push({
  id: "async-effect-race",
  rule: "STATE 11 — guard overlapping async effects",
  hits: raceHits,
});

if (UPDATE_BASELINE) {
  const entries: BaselineEntry[] = tier2Groups.flatMap((g) =>
    g.hits.map((h) => ({ id: g.id, file: h.file, text: h.text }))
  );
  await Deno.writeTextFile(
    BASELINE_PATH,
    JSON.stringify(entries, null, 2) + "\n",
  );
  console.log(`Baseline updated: ${entries.length} accepted tier-2 hit(s)`);
}

let baseline: BaselineEntry[] = [];
try {
  baseline = JSON.parse(await Deno.readTextFile(BASELINE_PATH));
} catch (err) {
  if (!(err instanceof Deno.errors.NotFound)) throw err;
}
const allowances = new Map<string, number>();
const key = (id: string, file: string, text: string) => `${id}|${file}|${text}`;
for (const e of baseline) {
  const k = key(e.id, e.file, e.text);
  allowances.set(k, (allowances.get(k) ?? 0) + 1);
}

let tier1Total = 0;
let newTier2 = 0;
let baselined = 0;

function report(label: "FAIL" | "REVIEW", id: string, rule: string, hits: Hit[]) {
  if (hits.length === 0) return;
  console.log(`\n[${label}] ${id} — ${rule}: ${hits.length} hit(s)`);
  for (const h of hits) {
    console.log(`  ${h.file}:${h.line}  ${h.text.slice(0, 100)}`);
  }
}

for (const check of CHECKS) {
  if (check.tier !== 1) continue;
  const hits = hitsByCheck.get(check.id)!;
  tier1Total += hits.length;
  report("FAIL", check.id, check.rule, hits);
}

for (const g of tier2Groups) {
  const fresh = g.hits.filter((h) => {
    const k = key(g.id, h.file, h.text);
    const n = allowances.get(k) ?? 0;
    if (n > 0) {
      allowances.set(k, n - 1);
      baselined++;
      return false;
    }
    return true;
  });
  newTier2 += fresh.length;
  report("REVIEW", g.id, g.rule, fresh);
}

const stale = [...allowances.values()].reduce((a, b) => a + b, 0);

console.log("");
if (stale > 0) {
  console.log(
    `NOTE: ${stale} baseline entr${stale === 1 ? "y" : "ies"} no longer match — run ./validate_protocols --update-baseline to prune.`,
  );
}
if (tier1Total > 0) {
  console.log("\x1b[91m╔══════════════════════════════════════════════════════════════╗");
  console.log("║                PROTOCOL VALIDATION FAILED                    ║");
  const msg = `${tier1Total} tier-1 violation(s); ${newTier2} new review flag(s)`;
  console.log(`║  ${msg.padEnd(60)}║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\x1b[0m");
  Deno.exit(1);
} else {
  console.log(
    `\x1b[92mPROTOCOL VALIDATION PASSED\x1b[0m — 0 tier-1 violations, ${newTier2} new tier-2 flag(s), ${baselined} baselined`,
  );
}
