// Deck blueprints: the drafting calls, shared by the app
// (slide_deck/blueprint/draft.ts) and any harness that replays a real deck.
// The model call itself is injected (runBlueprintDraft's `call`), so this
// file holds only words, shapes and order.
//
// A FASTR deck runs to a hundred slides, more than one answer can hold, so
// drafting is two steps:
//   1. TOPICS, from a compact outline of the whole deck: the topics, their
//      purposes and scaling rules, which of each topic's slides are distinct
//      patterns, the period roles, the footer/watermark patterns, a name.
//   2. BRIEFS, for the pattern slides only (a "one per region" run is
//      described once), in batches run a few at a time, each seeing its
//      slides in full: every block's brief, preset, period role and filter
//      intent. Block k of a slide here is block k of the skeleton built by
//      buildBlueprintSkeleton.
// combineBlueprintDraft joins the answers into what assembleBlueprint merges.

import { z } from "zod";
import type {
  BlueprintDraftFromAI,
  BlueprintSkeleton,
} from "./deck_blueprint.ts";
import {
  type ContentBlock,
  DECK_BLUEPRINT_PATTERN_TOKENS,
  type DeckBlueprintPeriodRole,
  type MetricWithStatus,
  type Slide,
} from "./types/mod.ts";

// Structured outputs allow no length bounds and at most 16 nullable or
// union fields in one schema, so every field is plain: "" is "none", 0
// months is "none", an empty patternSlideIndexes is "all". The blueprint
// schema bounds what lands (assembleBlueprint).
export const deckBlueprintTopicsOutputSchema = z.object({
  name: z.string(),
  description: z.string(),
  footerPattern: z.string().describe('"" when the deck has no footer'),
  watermarkPattern: z.string().describe('"" when the deck has no watermark'),
  periodRoles: z.array(z.object({
    id: z.string(),
    label: z.string(),
    kind: z.enum(["reporting", "comparison", "trend"]),
    months: z.number().describe("0 for a comparison role"),
  })),
  topics: z.array(z.object({
    name: z.string(),
    purpose: z.string(),
    scalingRule: z.string(),
    sourceSlideIndexes: z.array(z.number()),
    patternSlideIndexes: z.array(z.number()).describe("[] means all"),
  })),
});

export type DeckBlueprintTopicsOutput = z.infer<
  typeof deckBlueprintTopicsOutputSchema
>;

export const deckBlueprintBriefsOutputSchema = z.object({
  slides: z.array(z.object({
    index: z.number(),
    titleBrief: z.string(),
    subtitleBrief: z.string(),
    presenterBrief: z.string(),
    dateBrief: z.string(),
    headerBrief: z.string(),
    imageNote: z.string(),
    blocks: z.array(z.object({
      brief: z.string(),
      keepVerbatim: z.boolean(),
      purpose: z.string(),
      vizPresetId: z.string(),
      periodRole: z.string(),
      filterIntent: z.string(),
      captionBrief: z.string(),
      note: z.string(),
    })),
  })),
});

export type DeckBlueprintBriefsOutput = z.infer<
  typeof deckBlueprintBriefsOutputSchema
>;

const COMMON =
  `You help turn a FASTR slide deck made for one country into a BLUEPRINT that another country's deck can be built from. FASTR decks report health-facility data (HMIS service volumes, data quality, coverage, health facility assessments). A blueprint keeps the deck's structure and intent, never its country's facts. NEVER write the source country's name, region, district or facility names, numbers or findings in any field. Write in English. Fields that do not apply are "" (and months 0).

Every word must hold for ANY country's data. The source's FINDINGS (which way its numbers went, a collapse, a surge, a disruption, a cause, a recommendation that follows from them) belong to that country and must not travel: not in a name, description, purpose, scaling rule, brief, header or caption. Say WHAT to report and HOW, conditional on what the target's data shows. Not "State that reporting completeness collapsed in the reporting quarter" but "State how reporting completeness changed over the period; if it fell sharply, say so and caveat the figures that follow". Not "State that family planning volumes collapsed" but "State the main finding on family planning volumes over the period".`;

export const DECK_BLUEPRINT_TOPICS_SYSTEM = `${COMMON}

This step: from the deck's OUTLINE, decide its topics.
- TOPICS: group consecutive slides that serve one purpose (a cover; a section and its slides; "one slide per region" or "one slide per indicator" runs; an annex of tables). Every slide index goes in exactly one topic, in deck order.
- For each topic: a short name, its PURPOSE (why it is in the deck), and a SCALING RULE in plain words that another country can apply to its own data to decide how many slides it gets, including when to drop it. Examples: "One slide per region whose readiness is below 70%; if fewer than 2, combine them on one slide; if none, drop the topic." "Always one slide." "One slide per service area that shows a disruption; drop if none."
- patternSlideIndexes: the topic's slides that are distinct DESIGNS. When slides repeat one design for different subjects (one per region, one per indicator, one per domain), give only the first of the run; give each slide of a different design. An empty list means all.
- When a run collapses to fewer patterns than slides, the scaling rule must NAME the subjects the source's run covered, in its order, so the target keeps the same coverage and order wherever its data allows: "One slide per readiness domain the target's survey covers, in this order: service availability, service hours, infrastructure, utilities, vaccines, medicines, contraception, PPE, equipment, diagnostics; drop a domain with no data; combine two when each has little to say." Generic subject names only (domains, indicators, service areas), never the source's place names.
- periodRoles: the time windows the deck's fixed-date figures use (the outline marks them FIXED): always one "reporting" role (id "reporting"; months = its usual length, e.g. 3 for a quarter, 6 for a round, 12 for a year), plus "comparison" (same months a year earlier) or "trend" (months = the window, ending at the reporting period's end) roles when figures use them. Short ids (reporting, last_year, trend_24m).
- footerPattern / watermarkPattern: the deck's footer and watermark text with every country-specific part replaced by the tokens ${
  DECK_BLUEPRINT_PATTERN_TOKENS.join(", ")
}; "" when the deck has none.
- name: a short generic name for the blueprint (e.g. "HMIS quarterly summary deck"); description: two sentences on what decks built from it contain, not what the source found.`;

export const DECK_BLUEPRINT_BRIEFS_SYSTEM = `${COMMON}

This step: write the BRIEFS for the slides given in full. Answer for every slide given, and for every block in the order given.
- Briefs say what to write or show, never what the source wrote. Not "Bo district readiness fell to 61%" but "2 bullets: the readiness level of the region and its main gap, with the change since the last round". A cover's or section's titleBrief says what the title names ("Country name + quarter"); a content slide's headerBrief may keep a generic header as it is ("Methodology"); when the source's header states a finding, the brief is "State the main finding on <subject>", never the finding itself.
- keepVerbatim is true ONLY for text that does not depend on the country's data and must read the same everywhere: a methodology note, a definition, a fixed disclaimer, a description of FASTR.
- For figures: purpose (what the chart shows and why), vizPresetId chosen from the metric's presets listed at the top (the one whose description and type match the chart best; it must be one of those ids), periodRole for a figure with a FIXED period (one of the period role ids given), filterIntent describing in words which rows it shows ("the region this slide is about", "the indicators that dropped", "all regions"), never the values themselves, and captionBrief for the chart title.
- Image blocks: a short note of what the picture showed.`;

function enText(ts: { en: string } | string | undefined): string {
  if (ts === undefined) return "";
  return typeof ts === "string" ? ts : ts.en;
}

function headerOf(slide: Slide): string {
  return slide.type === "cover"
    ? slide.title
    : slide.type === "section"
    ? slide.sectionTitle
    : (slide.header ?? "");
}

function oneLine(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function blockSummary(
  block: ContentBlock,
  metrics: MetricWithStatus[],
): string {
  if (block.type === "text") return `text: ${oneLine(block.markdown, 90)}`;
  if (block.type === "image") return "image";
  const b = block.bundle;
  if (!b) return "empty figure";
  const pf = b.config.d.periodFilter;
  const fixed =
    pf && (pf.filterType === "custom" || pf.filterType === "from_month")
      ? " FIXED period"
      : "";
  const m = metrics.find((x) => x.id === b.metricId);
  return `figure ${b.metricId}${m ? ` (${m.label})` : ""} ${b.config.d.type}${
    b.config.t.caption ? ` "${oneLine(b.config.t.caption, 60)}"` : ""
  }${fixed}`;
}

// Step 1's view of the deck: one short line per slide and per block.
export function describeDeckOutline(
  skeleton: BlueprintSkeleton,
  slides: Slide[],
  metrics: MetricWithStatus[],
): string {
  const out = [
    `Deck: "${skeleton.sourceDeckLabel}" (${slides.length} slides).`,
    `Footer text: ${skeleton.footerText ?? "(none)"}`,
    `Watermark text: ${skeleton.watermarkText ?? "(none)"}`,
    "",
  ];
  slides.forEach((slide, index) => {
    out.push(`[${index}] ${slide.type}: ${oneLine(headerOf(slide), 100)}`);
    for (const block of skeleton.slides[index].sourceBlocks) {
      out.push(`    - ${blockSummary(block, metrics)}`);
    }
  });
  return out.join("\n");
}

function figureLines(
  block: Extract<ContentBlock, { type: "figure" }>,
  metrics: MetricWithStatus[],
): string[] {
  const b = block.bundle;
  if (!b) return ["(empty figure placeholder)"];
  const d = b.config.d;
  const metric = metrics.find((m) => m.id === b.metricId);
  const lines = [
    `FIGURE metric ${b.metricId}${
      metric ? ` ("${metric.label}")` : ""
    }, chart type ${d.type}`,
  ];
  if (b.config.t.caption) lines.push(`  caption: ${b.config.t.caption}`);
  if (d.disaggregateBy.length > 0) {
    lines.push(
      `  disaggregated by: ${
        d.disaggregateBy.map((x) => `${x.disOpt} as ${x.disDisplayOpt}`).join(
          ", ",
        )
      }`,
    );
  }
  for (const f of d.filterBy) {
    lines.push(`  filtered to ${f.disOpt}: ${f.values.join(", ")}`);
  }
  if (d.selectedReplicantValue) {
    lines.push(`  showing replicant: ${d.selectedReplicantValue}`);
  }
  const pf = d.periodFilter;
  if (pf) {
    lines.push(
      pf.filterType === "custom" || pf.filterType === "from_month"
        ? `  FIXED period ${pf.min} to ${pf.max} (needs a periodRole)`
        : `  relative period: ${JSON.stringify(pf)} (stays as it is)`,
    );
  }
  // This metric's own preset ids, beside the figure: listed only at the top,
  // the model took another metric's preset for a figure in a batch of many.
  const ids = (metric?.vizPresets ?? []).map((p) => p.id);
  lines.push(
    ids.length > 0
      ? `  vizPresetId must be ONE OF: ${ids.join(", ")}`
      : '  (this metric has no presets: give vizPresetId "")',
  );
  return lines;
}

// Step 2's view of some slides: each in full, with the presets of the
// metrics they use listed once at the top.
export function describeSlidesForBriefs(
  skeleton: BlueprintSkeleton,
  slides: Slide[],
  metrics: MetricWithStatus[],
  indexes: number[],
  context: { periodRoles: DeckBlueprintPeriodRole[]; topicOf: string[] },
): string {
  const used = new Set<string>();
  for (const i of indexes) {
    for (const b of skeleton.slides[i].sourceBlocks) {
      if (b.type === "figure" && b.bundle) used.add(b.bundle.metricId);
    }
  }
  const out = [
    `Deck: "${skeleton.sourceDeckLabel}". Period role ids: ${
      context.periodRoles.map((r) => `${r.id} (${r.label})`).join(", ") ||
      "reporting"
    }.`,
  ];
  if (used.size > 0) {
    out.push(
      "",
      "Presets of the metrics used (choose vizPresetId from these):",
    );
    for (const id of used) {
      const m = metrics.find((x) => x.id === id);
      const presets = m?.vizPresets ?? [];
      out.push(`- ${id}${m ? ` (${m.label})` : ""}:`);
      if (presets.length === 0) out.push("    (no presets in this package)");
      for (const p of presets) {
        out.push(
          `    - ${p.id}: ${enText(p.label)}. ${
            oneLine(enText(p.description), 160)
          } [type ${p.config.d.type}]`,
        );
      }
    }
  }
  out.push("");
  for (const index of indexes) {
    const slide = slides[index];
    out.push(
      `--- Slide index ${index} (${slide.type}), topic "${
        context.topicOf[index] ?? ""
      }"`,
    );
    if (slide.type === "cover") {
      out.push(`title: ${slide.title}`);
      if (slide.subtitle) out.push(`subtitle: ${slide.subtitle}`);
      if (slide.presenter) out.push(`presenter: ${slide.presenter}`);
      if (slide.date) out.push(`date: ${slide.date}`);
      continue;
    }
    if (slide.type === "section") {
      out.push(`title: ${slide.sectionTitle}`);
      if (slide.sectionSubtitle) out.push(`subtitle: ${slide.sectionSubtitle}`);
      continue;
    }
    out.push(`header: ${slide.header ?? ""}`);
    if (slide.split?.fill.type === "image") {
      out.push("side panel with a picture (give an imageNote)");
    }
    const sk = skeleton.slides[index];
    const pattern = sk.pattern;
    const spans = pattern.type === "content"
      ? pattern.rows.flatMap((row, r) =>
        row.map((c) => ({ row: r + 1, span: c.span }))
      )
      : [];
    sk.sourceBlocks.forEach((block, k) => {
      const at = `block ${k} (row ${spans[k]?.row}, span ${
        spans[k]?.span
      }/12):`;
      if (block.type === "text") {
        out.push(
          `${at} TEXT`,
          ...block.markdown.split("\n").map((l) => `  | ${l}`),
        );
      } else if (block.type === "image") {
        out.push(`${at} IMAGE`);
      } else {
        out.push(at, ...figureLines(block, metrics));
      }
    });
  }
  return out.join("\n");
}

const blank = (v: string): string | undefined => {
  const t = v.trim();
  return t === "" ? undefined : t;
};

// The pattern slides of the topics answer, in deck order: what step 2
// describes. A topic with no valid pattern index keeps all its slides.
export function patternSlideIndexes(
  topics: DeckBlueprintTopicsOutput["topics"],
  slideCount: number,
): number[] {
  const out = new Set<number>();
  const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < slideCount;
  for (const t of topics) {
    const own = t.sourceSlideIndexes.filter(valid);
    const chosen = t.patternSlideIndexes.filter((i) => own.includes(i));
    (chosen.length > 0 ? chosen : own).forEach((i) => out.add(i));
  }
  // A slide no topic names still gets a topic of its own in
  // assembleBlueprint, so it needs its briefs too.
  for (let i = 0; i < slideCount; i++) {
    if (!topics.some((t) => t.sourceSlideIndexes.includes(i))) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

export function combineBlueprintDraft(
  topics: DeckBlueprintTopicsOutput,
  briefs: DeckBlueprintBriefsOutput["slides"],
): BlueprintDraftFromAI {
  return {
    name: topics.name,
    description: topics.description,
    footerPattern: blank(topics.footerPattern),
    watermarkPattern: blank(topics.watermarkPattern),
    periodRoles: topics.periodRoles.map((r) => ({
      id: r.id,
      label: r.label,
      kind: r.kind,
      months: r.months > 0
        ? Math.max(1, Math.min(120, Math.round(r.months)))
        : undefined,
    })),
    topics: topics.topics.map((t) => ({
      name: t.name,
      purpose: t.purpose,
      scalingRule: t.scalingRule,
      sourceSlideIndexes: t.sourceSlideIndexes,
      patternSlideIndexes: t.patternSlideIndexes.length > 0
        ? t.patternSlideIndexes
        : undefined,
    })),
    slides: briefs.map((s) => ({
      index: s.index,
      titleBrief: blank(s.titleBrief),
      subtitleBrief: blank(s.subtitleBrief),
      presenterBrief: blank(s.presenterBrief),
      dateBrief: blank(s.dateBrief),
      headerBrief: blank(s.headerBrief),
      imageNote: blank(s.imageNote),
      blocks: s.blocks.map((b) => ({
        brief: blank(b.brief),
        keepVerbatim: b.keepVerbatim,
        purpose: blank(b.purpose),
        vizPresetId: blank(b.vizPresetId),
        periodRole: blank(b.periodRole),
        filterIntent: blank(b.filterIntent),
        captionBrief: blank(b.captionBrief),
        note: blank(b.note),
      })),
    })),
  };
}

// One structured model call: the system text, the user message, the
// schema; null when the answer did not parse (with why it stopped).
export type BlueprintDraftCall = <T>(
  system: string,
  user: string,
  schema: z.ZodType<T>,
) => Promise<{ data: T | null; stopReason: string | null }>;

export type BlueprintDraftProgress = {
  step: "topics" | "briefs";
  done: number;
  total: number;
};

const BRIEF_BATCH_BLOCKS = 30;
const BRIEF_CONCURRENCY = 4;

// Batches of whole slides, about BRIEF_BATCH_BLOCKS blocks each.
function batchesOf(skeleton: BlueprintSkeleton, indexes: number[]): number[][] {
  const out: number[][] = [];
  let current: number[] = [];
  let blocks = 0;
  for (const i of indexes) {
    const n = Math.max(1, skeleton.slides[i].sourceBlocks.length);
    if (current.length > 0 && blocks + n > BRIEF_BATCH_BLOCKS) {
      out.push(current);
      current = [];
      blocks = 0;
    }
    current.push(i);
    blocks += n;
  }
  if (current.length > 0) out.push(current);
  return out;
}

function failure(step: string, stopReason: string | null): Error {
  return new Error(
    stopReason === "max_tokens"
      ? `The AI's answer for ${step} was cut off. Please try again.`
      : `The AI's answer for ${step} could not be read. Please try again.`,
  );
}

export async function runBlueprintDraft(args: {
  skeleton: BlueprintSkeleton;
  slides: Slide[];
  metrics: MetricWithStatus[];
  call: BlueprintDraftCall;
  onProgress?: (p: BlueprintDraftProgress) => void;
}): Promise<BlueprintDraftFromAI> {
  const { skeleton, slides, metrics, call } = args;
  args.onProgress?.({ step: "topics", done: 0, total: 1 });
  const t = await call(
    DECK_BLUEPRINT_TOPICS_SYSTEM,
    describeDeckOutline(skeleton, slides, metrics),
    deckBlueprintTopicsOutputSchema,
  );
  if (t.data === null) throw failure("the topics", t.stopReason);
  const topics = t.data;

  const topicOf: string[] = [];
  for (const topic of topics.topics) {
    for (const i of topic.sourceSlideIndexes) topicOf[i] ??= topic.name;
  }
  const periodRoles = combineBlueprintDraft(topics, []).periodRoles;
  const batches = batchesOf(
    skeleton,
    patternSlideIndexes(topics.topics, slides.length),
  );
  const briefs: DeckBlueprintBriefsOutput["slides"] = [];
  let done = 0;
  args.onProgress?.({ step: "briefs", done, total: batches.length });
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      const r = await call(
        DECK_BLUEPRINT_BRIEFS_SYSTEM,
        describeSlidesForBriefs(skeleton, slides, metrics, batch, {
          periodRoles,
          topicOf,
        }),
        deckBlueprintBriefsOutputSchema,
      );
      if (r.data === null) {
        throw failure(
          `slides ${batch[0] + 1}–${batch.at(-1)! + 1}`,
          r.stopReason,
        );
      }
      // Only the slides this batch was given: an answer naming another is
      // not taken.
      briefs.push(...r.data.slides.filter((s) => batch.includes(s.index)));
      done++;
      args.onProgress?.({ step: "briefs", done, total: batches.length });
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(BRIEF_CONCURRENCY, batches.length) },
      worker,
    ),
  );
  return combineBlueprintDraft(topics, briefs);
}
