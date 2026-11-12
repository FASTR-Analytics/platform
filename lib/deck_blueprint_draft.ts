// Deck blueprints: the drafting call's words and shapes, shared by the app
// (slide_deck/blueprint/draft.ts, which makes the call) and any harness that
// replays a real deck. The call sees the deck through
// describeDeckForBlueprintDraft (block k of a slide is block k of the
// skeleton built by buildBlueprintSkeleton), answers in
// deckBlueprintDraftOutputSchema, and blueprintDraftFromOutput turns the
// answer into what assembleBlueprint merges.

import { z } from "zod";
import {
  type BlueprintDraftFromAI,
  type BlueprintSkeleton,
} from "./deck_blueprint.ts";
import {
  type ContentBlock,
  DECK_BLUEPRINT_PATTERN_TOKENS,
  type MetricWithStatus,
  type Slide,
} from "./types/mod.ts";

// Structured outputs allow no length bounds and at most 16 nullable or
// union fields in one schema, so every field is plain: "" is "none", 0
// months is "none", an empty patternSlideIndexes is "all". The blueprint
// schema bounds what lands (assembleBlueprint).
export const deckBlueprintDraftOutputSchema = z.object({
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

export type DeckBlueprintDraftOutput = z.infer<
  typeof deckBlueprintDraftOutputSchema
>;

export const DECK_BLUEPRINT_DRAFT_SYSTEM =
  `You turn a FASTR slide deck made for one country into a BLUEPRINT that another country's deck can be built from. FASTR decks report health-facility data (HMIS service volumes, data quality, coverage, health facility assessments).

A blueprint keeps the deck's structure and intent, never its country's facts:
- TOPICS: group consecutive slides that serve one purpose (a cover; a section and its slides; "one slide per region" runs). Every slide index goes in exactly one topic, in deck order.
- For each topic: a short name, its PURPOSE (why it is in the deck), and a SCALING RULE in plain words that another country can apply to its own data to decide how many slides it gets, including when to drop it. Examples: "One slide per region whose readiness is below 70%; if fewer than 2, combine them on one slide; if none, drop the topic." "Always one slide." "One slide per service area that shows a disruption; drop if none."
- patternSlideIndexes: the topic's slides that are distinct patterns. When slides repeat the same design for different subjects (one per region), give only the first. An empty list means all. Fields that do not apply are "" (and months 0).
- For every slide and every block (in the order given): BRIEFS that say what to write or show, never what the source wrote. Example: not "Bo district readiness fell to 61%" but "2 bullets: the readiness level of the region and its main gap, with the change since the last round". Briefs are in English.
- keepVerbatim is true ONLY for text that does not depend on the country's data and must read the same everywhere: a methodology note, a definition, a fixed disclaimer.
- For figures: purpose (what the chart shows and why), vizPresetId chosen from the metric's presets listed with it (the one whose description matches the chart best; it must be one of those ids), periodRole for a figure with fixed dates (the id of one of your periodRoles), filterIntent describing in words which rows it shows ("the region this slide is about", "the indicators that dropped", "all regions"), never the values themselves.
- periodRoles: the time windows the deck's fixed-date figures use: always one "reporting" role (months = its usual length, e.g. 3 for a quarter, 6 for a round), plus "comparison" (same months a year earlier) or "trend" (months = the window, ending at the reporting period's end) roles when figures use them.
- footerPattern / watermarkPattern: the deck's footer and watermark text with every country-specific part replaced by the tokens ${
    DECK_BLUEPRINT_PATTERN_TOKENS.join(", ")
  }; "" when the deck has none.
- Image blocks: a short note of what the picture showed.
- name: a short generic name for the blueprint (e.g. "HFA round results deck"); description: two sentences on what decks built from it contain.

NEVER write the source country's name, region, district or facility names, numbers or findings in any field.`;

function enText(ts: { en: string } | string | undefined): string {
  if (ts === undefined) return "";
  return typeof ts === "string" ? ts : ts.en;
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
  const presets = metric?.vizPresets ?? [];
  if (presets.length === 0) {
    lines.push("  presets: none in this package");
  } else {
    lines.push("  presets (choose vizPresetId from these):");
    for (const p of presets) {
      lines.push(
        `    - ${p.id}: ${enText(p.label)}. ${
          enText(p.description)
        } [type ${p.config.d.type}]`,
      );
    }
  }
  return lines;
}

export function describeDeckForBlueprintDraft(
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
    out.push(`--- Slide index ${index} (${slide.type})`);
    if (slide.type === "cover") {
      out.push(`title: ${slide.title}`);
      if (slide.subtitle) out.push(`subtitle: ${slide.subtitle}`);
      if (slide.presenter) out.push(`presenter: ${slide.presenter}`);
      if (slide.date) out.push(`date: ${slide.date}`);
      return;
    }
    if (slide.type === "section") {
      out.push(`title: ${slide.sectionTitle}`);
      if (slide.sectionSubtitle) out.push(`subtitle: ${slide.sectionSubtitle}`);
      return;
    }
    out.push(`header: ${slide.header ?? ""}`);
    if (slide.split?.fill.type === "image") {
      out.push("side panel with a picture (give an imageNote)");
    }
    // The skeleton's own blocks, in its reading order, so block k here is
    // block k of the answer (empty placeholders and blocks past the limit
    // are already out of it).
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
  });
  return out.join("\n");
}

export function blueprintDraftFromOutput(
  o: DeckBlueprintDraftOutput,
): BlueprintDraftFromAI {
  const u = (v: string): string | undefined => {
    const t = v.trim();
    return t === "" ? undefined : t;
  };
  return {
    name: o.name,
    description: o.description,
    footerPattern: u(o.footerPattern),
    watermarkPattern: u(o.watermarkPattern),
    periodRoles: o.periodRoles.map((r) => ({
      id: r.id,
      label: r.label,
      kind: r.kind,
      months: r.months > 0
        ? Math.max(1, Math.min(120, Math.round(r.months)))
        : undefined,
    })),
    topics: o.topics.map((t) => ({
      name: t.name,
      purpose: t.purpose,
      scalingRule: t.scalingRule,
      sourceSlideIndexes: t.sourceSlideIndexes,
      patternSlideIndexes: t.patternSlideIndexes.length > 0
        ? t.patternSlideIndexes
        : undefined,
    })),
    slides: o.slides.map((s) => ({
      index: s.index,
      titleBrief: u(s.titleBrief),
      subtitleBrief: u(s.subtitleBrief),
      presenterBrief: u(s.presenterBrief),
      dateBrief: u(s.dateBrief),
      headerBrief: u(s.headerBrief),
      imageNote: u(s.imageNote),
      blocks: s.blocks.map((b) => ({
        brief: u(b.brief),
        keepVerbatim: b.keepVerbatim,
        purpose: u(b.purpose),
        vizPresetId: u(b.vizPresetId),
        periodRole: u(b.periodRole),
        filterIntent: u(b.filterIntent),
        captionBrief: u(b.captionBrief),
        note: u(b.note),
      })),
    })),
  };
}
