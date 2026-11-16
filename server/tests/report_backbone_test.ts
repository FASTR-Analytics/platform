// Pins report backbones (lib/types/report_backbone.ts, lib/report_backbone.ts):
// the schema, the theme, the page map's bars and the plain waiver a backbone
// sets, the `:::report` line it writes into a body, a body holding only that
// line still counting as untouched, the style snapshot carrying it, and the
// house-style section of the report AI's brief.
//
// The backbone here is the one Phase 1 seeds by hand from the Mamou district
// bulletin (Guinea, July 2026).
//
// Run: deno test -A server/tests/report_backbone_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  applyReportBackboneHeader,
  backboneFromDraft,
  describeReportBackboneForBrief,
  FASTR_DEFAULT_PAGE_LIMITS,
  getEditingReportInstructions,
  getReportBackbone,
  isUntouchedReport,
  measureReportBackbone,
  readFastrDocumentSettings,
  type ReportBackbone,
  reportBackboneAllowsPlain,
  type ReportBackboneDraftOutput,
  reportBackbonePageLimits,
  reportBackboneSchema,
  reportBackboneTheme,
  reportConfigSchema,
  reportStyleBodySchema,
} from "lib";

const MAMOU: ReportBackbone = {
  version: 1,
  look: {
    theme: "default",
    report: {
      figures: "numbered",
      captions: "above",
      source: "DHIS2 SNIS",
      frame: "double",
      header: "Bulletin mensuel · {Place} · {Period}",
    },
  },
  cover: {
    layout: "bulletin",
    fill: true,
    issue: "N°{Issue}/{Year}",
    date: "{Period}",
    masthead: [
      "Ministère de la Santé et de l'Hygiène Publique",
      "Direction préfectorale de la santé",
    ],
    logoSlots: 2,
  },
  signoff: { labels: ["Le Gestionnaire des données"] },
  length: {
    pagesMin: 10,
    pagesMax: 16,
    wordsPerPage: 120,
    wordsPerFigure: 50,
    minPageFill: 0.35,
  },
  structure: {
    outline: [
      {
        role: "Reporting",
        purpose: "completeness and timeliness by facility",
      },
      {
        role: "Indicator",
        purpose: "one figure by facility and its analysis",
        repeat: true,
      },
    ],
    oneFigurePerSection: true,
    figureLeadIn: "Analyse :",
  },
  templates: { use: "never" },
  widgets: { band: "never", tiles: "never", callout: "rare", quote: "never" },
  charts: {
    preferred: ["chart", "table"],
    breakdown: "by health facility",
    comparison: "same_period_last_year",
    approximated: ["a national target line across the bars"],
  },
  voice: { language: "fr", register: "formal" },
};

Deno.test("the schema takes a full backbone and refuses a bad one", () => {
  assertEquals(reportBackboneSchema.parse(MAMOU), MAMOU);
  assert(
    !reportBackboneSchema.safeParse({
      ...MAMOU,
      templates: { use: "sometimes" },
    }).success,
  );
  // A style body carries one, optionally.
  const body = {
    label: "Bulletin de district",
    description: "",
    brief: "",
    referenceCss: null,
    colors: null,
    productIds: null,
  };
  assert(reportStyleBodySchema.safeParse(body).success);
  assert(
    reportStyleBodySchema.safeParse({
      ...body,
      backbone: MAMOU,
      backboneSource: "pdf",
    }).success,
  );
});

Deno.test("the theme it names, when the engine knows it", () => {
  assertEquals(reportBackboneTheme(MAMOU), "default");
  assertEquals(
    reportBackboneTheme({ ...MAMOU, look: { theme: "no-such-theme" } }),
    undefined,
  );
});

Deno.test("its page bars: never above the defaults, only what it says", () => {
  const limits = reportBackbonePageLimits(MAMOU);
  assertEquals(limits.shortShare, 0.35);
  assertEquals(limits.breakShortShare, 0.35);
  assert(limits.holeShare! <= FASTR_DEFAULT_PAGE_LIMITS.holeShare);
  assertEquals(limits.figureMinProseWords, 50);
  assertEquals(reportBackbonePageLimits(undefined), {});
  assertEquals(reportBackbonePageLimits({ version: 1, look: {} }), {});
  // A generous fill is capped at the default bar, never raised.
  assertEquals(
    reportBackbonePageLimits({
      version: 1,
      look: {},
      length: { minPageFill: 0.9 },
    })
      .shortShare,
    FASTR_DEFAULT_PAGE_LIMITS.shortShare,
  );
});

Deno.test("a backbone of quiet blocks writes plain reports", () => {
  assert(reportBackboneAllowsPlain(MAMOU));
  assert(
    !reportBackboneAllowsPlain({ ...MAMOU, widgets: { callout: "often" } }),
  );
  assert(!reportBackboneAllowsPlain({ version: 1, look: {} }));
});

Deno.test("its `:::report` line goes into a body, patched or put first", () => {
  const fresh = applyReportBackboneHeader("# Bulletin\n\n", MAMOU);
  const settings = readFastrDocumentSettings(fresh);
  assertEquals(settings.page.furniture?.frame?.style, "double");
  assertStringIncludes(fresh.split("\n")[0], "figures=numbered");
  assertStringIncludes(fresh, "# Bulletin");
  // An existing header keeps its other attributes.
  const patched = applyReportBackboneHeader(
    ":::report{orientation=landscape}\n\n# B\n",
    MAMOU,
  );
  assertStringIncludes(patched.split("\n")[0], "orientation=landscape");
  assertStringIncludes(patched.split("\n")[0], "captions=above");
  // Applied twice: unchanged.
  assertEquals(applyReportBackboneHeader(patched, MAMOU), patched);
  // A body that holds only that line and a title is still untouched.
  const none = { figures: {}, images: {} };
  assert(isUntouchedReport({ body: fresh, ...none }));
  assert(!isUntouchedReport({ body: `${fresh}A sentence.\n`, ...none }));
});

Deno.test("the style snapshot carries it, and a broken one reads as none", () => {
  const config = reportConfigSchema.parse({
    version: 1,
    format: "fastr",
    fastrTheme: "default",
    customStyle: { id: "s1", label: "Bulletin", brief: "", backbone: MAMOU },
  });
  assertEquals(getReportBackbone(config)?.cover?.layout, "bulletin");
  assertEquals(
    getReportBackbone({
      customStyle: {
        id: "s1",
        label: "B",
        brief: "",
        backbone: { version: 2 } as unknown as ReportBackbone,
      },
    }),
    undefined,
  );
});

Deno.test("the house-style section overrides the guide's defaults", () => {
  const text = describeReportBackboneForBrief("Bulletin de district", MAMOU);
  for (
    const s of [
      'house style: "Bulletin de district"',
      "THE HOUSE STYLE WINS",
      "figures=numbered",
      'header="Bulletin mensuel · {Place} · {Period}"',
      "Replace the {Place}",
      "`layout=bulletin`",
      "`:::masthead`",
      "Ministère de la Santé et de l'Hygiène Publique",
      '"Le Gestionnaire des données"',
      "never invent a name",
      "about 50 words that read each chart",
      "filled to 35%",
      "completeness and timeliness by facility",
      "**Analyse :**",
      "Page templates.** Use none",
      "`band` never",
      "bar charts, then tables",
      "by health facility",
      "same period a year earlier",
      'language "fr"',
    ]
  ) assertStringIncludes(text, s);
  // It reaches the brief only with a backbone.
  assertStringIncludes(
    getEditingReportInstructions("R", {
      backbone: { label: "Bulletin de district", backbone: MAMOU },
    }),
    "THE HOUSE STYLE WINS",
  );
  assert(!getEditingReportInstructions("R").includes("house style"));
});

const DRAFT: ReportBackboneDraftOutput = {
  name: "Bulletin mensuel de district",
  description: "Un bulletin mensuel par formation sanitaire.",
  pageColor: "#FFFFFF",
  inkColor: "#222222",
  accentColor: "#15225e",
  theme: "no-such-theme",
  figuresNumbered: true,
  captionsAbove: true,
  sourceLine: "DHIS2 SNIS",
  headerText: "",
  footerText: "",
  frame: "double",
  frameColor: "navy",
  footerRuleColors: ["#ce1126", "#fcd116", "#009460", "bad"],
  numberedSections: false,
  sectionBars: false,
  coverLayout: "bulletin",
  coverFillsPage: true,
  coverKicker: "",
  coverSub: "District sanitaire de {Place}",
  coverIssue: "N°{Issue}/{Year}",
  coverDate: "{Period}",
  mastheadLines: ["Ministère de la Santé", ""],
  logoCount: 2,
  signoffLabels: ["Le Gestionnaire des données"],
  pagesTypical: 15,
  wordsPerPage: 110,
  wordsPerFigure: 60,
  leastPageFillPercent: 30,
  outline: [{
    role: "Indicateur",
    purpose: "une figure et son analyse",
    repeat: true,
  }],
  oneFigurePerSection: true,
  figureLeadIn: "Analyse :",
  templates: "never",
  widgets: {
    callout: "never",
    tiles: "never",
    stat: "never",
    columns: "never",
    quote: "never",
    band: "never",
    steps: "never",
    contents: "",
    logos: "rare",
    masthead: "rare",
    signoff: "rare",
  },
  chartTypes: ["chart", "table", "chart"],
  chartBreakdown: "par formation sanitaire",
  chartComparison: "same_period_last_year",
  chartsNotPossible: ["une ligne d'objectif"],
  language: "FR",
  register: "formal",
  notes: "Chaque analyse ouvre sur le chiffre du district.",
};

Deno.test("a draft becomes a checked backbone, and what does not fit is said", () => {
  const d = backboneFromDraft(DRAFT);
  assertEquals(d.label, "Bulletin mensuel de district");
  assertEquals(d.colors, {
    page: "#ffffff",
    ink: "#222222",
    accent: "#15225e",
  });
  assertEquals(d.backbone.look.theme, undefined);
  assertEquals(d.backbone.look.report?.frame, "double");
  assertEquals(d.backbone.look.report?.framecolor, undefined);
  assertEquals(
    d.backbone.look.report?.footerrule,
    "#ce1126 #fcd116 #009460",
  );
  assertEquals(d.backbone.cover?.masthead, ["Ministère de la Santé"]);
  assertEquals(d.backbone.length?.minPageFill, 0.3);
  assertEquals(d.backbone.charts?.preferred, ["chart", "table"]);
  assertEquals(d.backbone.widgets?.contents, undefined);
  assertEquals(d.backbone.voice?.language, "fr");
  assert(d.warnings.some((w) => w.includes("no-such-theme")));
  assert(d.warnings.some((w) => w.includes("navy")));
  assert(d.warnings.some((w) => w.includes('"bad"')));
});

Deno.test("a FASTR report is measured into a backbone", () => {
  const body = [
    ":::report{figures=numbered frame=line numbering=sections}",
    "",
    ':::cover{layout=bulletin fill=page issue="N°07/2026"}',
    ":::masthead",
    ":::logos{align=spread}",
    "Ministère de la Santé",
    ":::",
    "",
    "# Bulletin",
    ":::",
    "",
    "## Complétude",
    "",
    "![Complétude](figure:a)",
    "",
    "**Analyse :** la complétude est de 100 % pour ce mois dans le district.",
    "",
    ":::signoff",
    ':::signer{label="Rédacteur"}',
    "**Nom**",
    ":::",
    ":::",
  ].join("\n");
  const m = measureReportBackbone({
    label: "Bulletin de Mamou",
    body,
    theme: "ministry",
    colors: null,
    figureTypes: ["chart"],
    pages: 2,
  });
  const b = m.backbone;
  assertEquals(b.look.theme, "ministry");
  assertEquals(b.look.report, { figures: "numbered", frame: "line" });
  assertEquals(b.structure?.numberedSections, true);
  assertEquals(b.cover?.layout, "bulletin");
  assertEquals(b.cover?.issue, "N°07/2026");
  assertEquals(b.cover?.masthead, ["Ministère de la Santé"]);
  assertEquals(b.signoff?.labels, ["Rédacteur"]);
  assertEquals(b.widgets?.masthead, "rare");
  assertEquals(b.widgets?.band, "never");
  assertEquals(b.templates?.use, "never");
  assertEquals(b.charts?.preferred, ["chart"]);
  assertEquals(b.structure?.outline?.map((o) => o.role), ["Complétude"]);
  assert(m.warnings[0].includes("{Place}"));
});
