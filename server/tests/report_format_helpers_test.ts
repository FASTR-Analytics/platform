// Pins the report embed helpers and config helpers (lib/types/reports.ts).
// Every token read/write in the app goes through them, and the editor's
// load-time orphan prune deletes registry entries based on what they (fail to)
// find.
//
// Run: deno test -A server/tests/report_format_helpers_test.ts

import { assert, assertEquals } from "@std/assert";
import {
  buildReportEmbedToken,
  escapeReportHtml,
  findReportEmbeds,
  getReportCustomStyle,
  getStartingBodyForReport,
  getStartingConfigForReport,
  isRetiredReportFormat,
  parseReportEmbedLine,
  referencedReportEmbedIds,
  replaceReportEmbedTokens,
  reportConfigSchema,
  rewriteReportEmbedToken,
  sanitizeReportCaption,
} from "../../lib/types/reports.ts";

const ID = "8b7c1c2e-6f2a-4a3b-9c1d-0e1f2a3b4c5d";
const ID2 = "11111111-2222-4333-8444-555555555555";

Deno.test("isRetiredReportFormat is total, and only the html format is retired", () => {
  assertEquals(isRetiredReportFormat(undefined), false);
  assertEquals(isRetiredReportFormat(null), false);
  assertEquals(isRetiredReportFormat({}), false);
  assertEquals(isRetiredReportFormat({ format: "fastr" }), false);
  assertEquals(isRetiredReportFormat({ format: "html" }), true);
  // deno-lint-ignore no-explicit-any
  assertEquals(isRetiredReportFormat({ format: 3 } as any), false);
});

Deno.test("a new report is FASTR Markdown on the default theme, its look not yet chosen", () => {
  const config = getStartingConfigForReport();
  assertEquals(config, {
    version: 1,
    format: "fastr",
    fastrTheme: "default",
    themeChosen: false,
  });
  assert(reportConfigSchema.safeParse(config).success);
});

Deno.test("a config of a retired format still parses, its old keys riding through", () => {
  const stored = { version: 1, format: "html", htmlStyle: "editorial" };
  const parsed = reportConfigSchema.parse(stored);
  assertEquals(parsed, stored);
});

Deno.test("custom style snapshot round-trips through the config schema", () => {
  const snap = {
    id: "s1",
    label: "House style",
    brief: "",
    referenceCss: null,
    colors: { page: "#ffffff", ink: "#111111", accent: "#aa0000" },
  };
  const cfg = getStartingConfigForReport(snap, "ministry");
  assertEquals(cfg.fastrTheme, "ministry");
  const parsed = reportConfigSchema.parse(cfg);
  assertEquals(getReportCustomStyle(parsed)?.colors?.accent, "#aa0000");
  assertEquals(getReportCustomStyle({}), undefined);
});

Deno.test("starting body is the title alone", () => {
  assertEquals(getStartingBodyForReport("Q1 <review>"), "# Q1 <review>\n\n");
});

Deno.test("escapeReportHtml escapes the four markup characters", () => {
  assertEquals(
    escapeReportHtml(`a & b <c> "d"`),
    "a &amp; b &lt;c&gt; &quot;d&quot;",
  );
});

Deno.test("tokens: find / line / build", () => {
  const body =
    `# T\n\n![Cap one](figure:${ID})\ntext ![inline](image:${ID2}) more\n`;
  const refs = findReportEmbeds(body);
  assertEquals(refs.map((r) => [r.kind, r.id, r.caption]), [
    ["figure", ID, "Cap one"],
    ["image", ID2, "inline"],
  ]);
  assertEquals(body.slice(refs[0].start, refs[0].end), refs[0].raw);
  assertEquals(parseReportEmbedLine(`  ![c](figure:${ID})  `), {
    kind: "figure",
    id: ID,
    caption: "c",
  });
  assertEquals(parseReportEmbedLine(`x ![c](figure:${ID})`), undefined);
  assertEquals(
    buildReportEmbedToken("figure", ID, " a [b]\nc "),
    `![a b c](figure:${ID})`,
  );
  assertEquals(sanitizeReportCaption(" a [b]\n c "), "a b c");
});

Deno.test("rewriteReportEmbedToken rebuilds the token from the patch", () => {
  const [ref] = findReportEmbeds(`![old](figure:${ID})`);
  assertEquals(
    rewriteReportEmbedToken(ref, { id: ID2, caption: "n [x]" }),
    `![n x](figure:${ID2})`,
  );
  assertEquals(
    rewriteReportEmbedToken(ref, { caption: "c" }),
    `![c](figure:${ID})`,
  );
});

Deno.test("replaceReportEmbedTokens replaces every occurrence of (kind,id) and counts", () => {
  const body =
    `![a](figure:${ID})\n\ntext\n\n![b](figure:${ID})\n\n![z](figure:${ID2})`;
  const res = replaceReportEmbedTokens(
    body,
    "figure",
    ID,
    (ref) => rewriteReportEmbedToken(ref, { id: ID2 }),
  );
  assertEquals(res.count, 2);
  assertEquals(
    res.body,
    `![a](figure:${ID2})\n\ntext\n\n![b](figure:${ID2})\n\n![z](figure:${ID2})`,
  );
});

Deno.test("referencedReportEmbedIds('any') finds references the token scan misses", () => {
  const body = [
    `![md](figure:${ID})`,
    `<a href="#"><img src = "image:${ID2}"></a>`, // a hand-written tag
    `see figure:abc-DEF_1 in text`,
  ].join("\n");
  const any = referencedReportEmbedIds(body, "any");
  assertEquals([...any.figures].sort(), [ID, "abc-DEF_1"].sort());
  assertEquals([...any.images], [ID2]);
  const tokens = referencedReportEmbedIds(body);
  assertEquals([...tokens.figures], [ID]);
  assertEquals(tokens.images.size, 0);
});
