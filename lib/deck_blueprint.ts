// Deck blueprints: the pure half. The format and what it may carry are the
// authoritative comment in lib/types/_deck_blueprint.ts. This file:
//   - flattens a slide's layout into the blueprint's grid (gridFromLayout),
//   - drafts the parts of a blueprint no judgement is needed for, straight
//     from the deck (buildBlueprintSkeleton): the look, each slide's grid, each
//     figure's metric and period kind, the slots,
//   - merges the AI's judgement into that skeleton (assembleBlueprint), so a
//     model answer can only fill words in, never invent a metric or a block,
//   - finds the source's own names left in the words (findSourceTermHits),
//   - resolves period roles and fills the look on the target side,
//   - reads a blueprint file and the record a deck keeps of one.

import type { LayoutNode } from "@timroberton/panther";
import type { ContentBlock, Slide, SlideDeckConfig } from "./types/slides.ts";
import {
  DECK_BLUEPRINT_FORMAT_VERSION,
  DECK_BLUEPRINT_KIND,
  DECK_BLUEPRINT_MAX_BLOCKS,
  DECK_BLUEPRINT_PROVENANCE_KIND,
  DECK_BLUEPRINT_TEXT_MAX,
  type DeckBlueprint,
  type DeckBlueprintBlock,
  type DeckBlueprintCell,
  type DeckBlueprintFigurePeriod,
  type DeckBlueprintLook,
  type DeckBlueprintPeriodRole,
  type DeckBlueprintProvenance,
  deckBlueprintProvenanceSchema,
  deckBlueprintSchema,
  type DeckBlueprintSlide,
  type DeckBlueprintSplit,
  type ResolvedBlueprintPeriod,
} from "./types/_deck_blueprint.ts";
import { relativePeriodFilterSchema } from "./types/_metric_installed.ts";
import { parseJsonOrUndefined } from "./utils.ts";

const COLUMNS = 12;

// ── Layout → grid ───────────────────────────────────────────────────────────

export type BlueprintGridCell<T> = { span: number; block: T };

function leaves(node: LayoutNode<ContentBlock>): ContentBlock[] {
  return node.type === "item"
    ? [node.data]
    : node.children.flatMap((c) => leaves(c));
}

// Rows of cells whose spans sum to 12. A `rows` node stacks its children's
// rows; a `cols` node lays its children side by side as one row, each child
// one cell at its span. A column that itself stacks several blocks becomes
// that many cells sharing the column's width: the grid has one level, so a
// stacked column is the one shape it approximates.
export function gridFromLayout(
  layout: LayoutNode<ContentBlock>,
): BlueprintGridCell<ContentBlock>[][] {
  if (layout.type === "item") return [[{ span: COLUMNS, block: layout.data }]];
  if (layout.type === "rows") {
    return layout.children.flatMap((child) =>
      child.type === "item"
        ? [[{ span: COLUMNS, block: child.data }]]
        : gridFromLayout(child)
    );
  }
  const columns = layout.children.map((child) => ({
    span: child.span,
    blocks: leaves(child),
  }));
  const spans = normalizeSpans(columns.map((c) => c.span));
  const row: BlueprintGridCell<ContentBlock>[] = [];
  columns.forEach((col, i) => {
    const share = normalizeSpans(col.blocks.map(() => undefined), spans[i]);
    col.blocks.forEach((block, j) => row.push({ span: share[j], block }));
  });
  return [row];
}

// Spans that sum to `total`: given spans kept in proportion, missing ones
// shared equally, every span at least 1.
export function normalizeSpans(
  spans: (number | undefined)[],
  total = COLUMNS,
): number[] {
  if (spans.length === 0) return [];
  const given = spans.filter((s): s is number => s !== undefined && s > 0);
  const missing = spans.length - given.length;
  const givenSum = given.reduce((a, b) => a + b, 0);
  const each = missing === 0
    ? 0
    : Math.max(1, (total - Math.min(givenSum, total)) / missing);
  const raw = spans.map((s) => (s !== undefined && s > 0 ? s : each));
  const sum = raw.reduce((a, b) => a + b, 0);
  const scaled = raw.map((s) => Math.max(1, Math.floor((s / sum) * total)));
  let diff = total - scaled.reduce((a, b) => a + b, 0);
  // Bounded: with more cells than columns no assignment sums to `total`.
  for (
    let i = 0, guard = 0;
    diff !== 0 && guard < total * scaled.length;
    i = (i + 1) % scaled.length, guard++
  ) {
    if (diff > 0) {
      scaled[i]++;
      diff--;
    } else if (scaled[i] > 1) {
      scaled[i]--;
      diff++;
    }
  }
  return scaled;
}

// The grid with more than DECK_BLUEPRINT_MAX_BLOCKS blocks, or more than 4
// rows or cells a row, kept to the limits: the excess blocks are dropped
// from the end and reported, so the review panel can say which.
function capGrid<T>(
  grid: BlueprintGridCell<T>[][],
): { grid: BlueprintGridCell<T>[][]; dropped: number } {
  const out: BlueprintGridCell<T>[][] = [];
  let kept = 0;
  let dropped = 0;
  for (const row of grid) {
    if (out.length === 4) {
      dropped += row.length;
      continue;
    }
    const cells: BlueprintGridCell<T>[] = [];
    for (const cell of row) {
      if (cells.length === 4 || kept === DECK_BLUEPRINT_MAX_BLOCKS) {
        dropped++;
        continue;
      }
      cells.push(cell);
      kept++;
    }
    if (cells.length > 0) {
      const spans = normalizeSpans(cells.map((c) => c.span));
      out.push(cells.map((c, i) => ({ ...c, span: spans[i] })));
    }
  }
  return { grid: out, dropped };
}

// ── Skeleton: everything that needs no judgement ────────────────────────────

// What the AI is told about one source block, beside the block's place in
// the skeleton. The client adds the figure's full description (its
// formatter lives there) under `figureDescription`.
export type SkeletonBlockFacts =
  | { type: "text"; text: string; words: number }
  | {
    type: "figure";
    metricId: string;
    chartType: string;
    caption: string;
    periodKind: "bounded" | "relative" | "none";
    periodBounds?: { min: number; max: number };
  }
  | { type: "image" }
  | { type: "empty_figure" };

export type SkeletonSlide = {
  index: number;
  pattern: DeckBlueprintSlide;
  // Content slides: the facts per block, in the grid's reading order, and
  // the source block each was made from (the prompt describes it in full).
  blocks: SkeletonBlockFacts[];
  sourceBlocks: ContentBlock[];
  // Cover/section/content header text as written.
  texts: Record<string, string>;
  droppedBlocks: number;
  // An empty figure placeholder in the source: no metric to carry.
  emptyFigures: number;
};

export type BlueprintSkeleton = {
  sourceDeckLabel: string;
  look: DeckBlueprintLook;
  slides: SkeletonSlide[];
  // The source's footer and watermark as written, for the AI to turn into
  // patterns.
  footerText: string | undefined;
  watermarkText: string | undefined;
};

// Words as a reader counts them: list markers and other markdown tokens
// carry no letter or digit and are skipped.
function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

function figurePeriod(
  block: Extract<ContentBlock, { type: "figure" }>,
): {
  period: DeckBlueprintFigurePeriod;
  kind: "bounded" | "relative" | "none";
  bounds?: { min: number; max: number };
} {
  const pf = block.bundle?.config.d.periodFilter;
  if (!pf) return { period: { kind: "preset" }, kind: "none" };
  if (pf.filterType === "custom" || pf.filterType === "from_month") {
    return {
      period: { kind: "role", role: "reporting" },
      kind: "bounded",
      bounds: { min: pf.min, max: pf.max },
    };
  }
  const rel = relativePeriodFilterSchema.safeParse(pf);
  return rel.success
    ? { period: { kind: "relative", filter: rel.data }, kind: "relative" }
    : { period: { kind: "preset" }, kind: "none" };
}

function skeletonBlock(
  block: ContentBlock,
): { pattern: DeckBlueprintBlock; facts: SkeletonBlockFacts } | undefined {
  if (block.type === "text") {
    return {
      pattern: {
        type: "text",
        brief: "",
        targetWords: wordCount(block.markdown),
        textSize: block.style?.textSize,
        textBackground: block.style?.textBackground || undefined,
        keepVerbatim: false,
      },
      facts: {
        type: "text",
        text: block.markdown,
        words: wordCount(block.markdown),
      },
    };
  }
  if (block.type === "image") {
    return {
      pattern: { type: "image_slot", note: "" },
      facts: { type: "image" },
    };
  }
  const bundle = block.bundle;
  if (!bundle) return undefined;
  const p = figurePeriod(block);
  return {
    pattern: {
      type: "figure",
      metricId: bundle.metricId,
      // Filled by the AI from the metric's presets; a bundle keeps no
      // preset id. assembleBlueprint refuses an id the metric lacks.
      vizPresetId: "",
      purpose: "",
      chartType: bundle.config.d.type,
      period: p.period,
    },
    facts: {
      type: "figure",
      metricId: bundle.metricId,
      chartType: bundle.config.d.type,
      caption: bundle.config.t.caption ?? "",
      periodKind: p.kind,
      periodBounds: p.bounds,
    },
  };
}

function splitPattern(
  split: Extract<Slide, { type: "content" }>["split"],
): DeckBlueprintSplit | undefined {
  if (!split) return undefined;
  if (split.fill.type === "image") {
    return {
      placement: split.placement,
      sizeAsPct: split.sizeAsPct,
      fill: { type: "plain" },
      imageNote: "The source showed a picture in this panel.",
    };
  }
  return {
    placement: split.placement,
    sizeAsPct: split.sizeAsPct,
    fill: split.fill,
  };
}

export function buildBlueprintSkeleton(args: {
  deckLabel: string;
  config: SlideDeckConfig;
  slides: Slide[];
}): BlueprintSkeleton {
  const { config } = args;
  const slot = (s: SlideDeckConfig["logos"]["cover"]) => ({
    count: s.selected.length,
    showByDefault: s.showByDefault,
  });
  const look: DeckBlueprintLook = {
    theme: config.theme,
    headerSize: config.headerSize,
    showPageNumbers: config.showPageNumbers,
    useWatermark: config.useWatermark,
    logoSlots: {
      cover: slot(config.logos.cover),
      header: slot(config.logos.header),
      footer: slot(config.logos.footer),
    },
  };

  const slides = args.slides.map((slide, index): SkeletonSlide => {
    if (slide.type === "cover") {
      return {
        index,
        pattern: { type: "cover", titleBrief: "" },
        blocks: [],
        sourceBlocks: [],
        texts: {
          title: slide.title,
          subtitle: slide.subtitle ?? "",
          presenter: slide.presenter ?? "",
          date: slide.date ?? "",
        },
        droppedBlocks: 0,
        emptyFigures: 0,
      };
    }
    if (slide.type === "section") {
      return {
        index,
        pattern: { type: "section", titleBrief: "" },
        blocks: [],
        sourceBlocks: [],
        texts: {
          title: slide.sectionTitle,
          subtitle: slide.sectionSubtitle ?? "",
        },
        droppedBlocks: 0,
        emptyFigures: 0,
      };
    }
    let emptyFigures = 0;
    const grid = gridFromLayout(slide.layout).map((row) =>
      row.flatMap((cell) => {
        const b = skeletonBlock(cell.block);
        if (!b) {
          emptyFigures++;
          return [];
        }
        return [{ span: cell.span, block: { ...b, source: cell.block } }];
      })
    ).filter((row) => row.length > 0);
    const capped = capGrid(grid);
    const rows: DeckBlueprintCell[][] = capped.grid.map((row) =>
      row.map((c) => ({ span: c.span, block: c.block.pattern }))
    );
    return {
      index,
      pattern: {
        type: "content",
        headerBrief: "",
        // A slide whose every block was an empty placeholder still keeps a
        // text cell, so the pattern stays a valid slide.
        rows: rows.length > 0 ? rows : [[{
          span: COLUMNS,
          block: { type: "text", brief: "", keepVerbatim: false },
        }]],
        split: splitPattern(slide.split),
      },
      blocks: capped.grid.flatMap((row) => row.map((c) => c.block.facts)),
      sourceBlocks: capped.grid.flatMap((row) =>
        row.map((c) => c.block.source)
      ),
      texts: { header: slide.header ?? "", subHeader: slide.subHeader ?? "" },
      droppedBlocks: capped.dropped,
      emptyFigures,
    };
  });

  return {
    sourceDeckLabel: args.deckLabel,
    look,
    slides,
    footerText: config.globalFooterText || undefined,
    watermarkText: config.useWatermark && config.watermarkText
      ? config.watermarkText
      : undefined,
  };
}

// ── The AI's judgement, merged into the skeleton ────────────────────────────

// What the drafting call returns. Every field is words or a choice among
// ids it was shown; assembleBlueprint checks each choice.
export type BlueprintDraftFromAI = {
  name: string;
  description: string;
  footerPattern?: string;
  watermarkPattern?: string;
  periodRoles: DeckBlueprintPeriodRole[];
  topics: {
    name: string;
    purpose: string;
    scalingRule: string;
    sourceSlideIndexes: number[];
    // The slides of the topic that become its patterns; default all.
    patternSlideIndexes?: number[];
  }[];
  slides: {
    index: number;
    titleBrief?: string;
    subtitleBrief?: string;
    presenterBrief?: string;
    dateBrief?: string;
    headerBrief?: string;
    imageNote?: string;
    blocks: {
      brief?: string;
      keepVerbatim?: boolean;
      purpose?: string;
      vizPresetId?: string;
      periodRole?: string;
      filterIntent?: string;
      captionBrief?: string;
      note?: string;
    }[];
  }[];
};

// `patternSources[t][s]` is the source slide index the pattern at
// topics[t].slides[s] was made from, for the review panel's thumbnails.
export type AssembleResult =
  | {
    success: true;
    data: DeckBlueprint;
    warnings: string[];
    patternSources: number[][];
  }
  | { success: false; err: string };

export function assembleBlueprint(
  skeleton: BlueprintSkeleton,
  draft: BlueprintDraftFromAI,
  // metricId → that metric's presets (id and chart type), in the source
  // package.
  presetsByMetric: Record<string, { id: string; type: string }[]>,
  createdAt: string,
): AssembleResult {
  const warnings: string[] = [];
  const roles = draft.periodRoles.length > 0 ? draft.periodRoles : [{
    id: "reporting",
    label: "Reporting period",
    kind: "reporting" as const,
    months: 3,
  }];
  if (!roles.some((r) => r.kind === "reporting")) {
    roles.unshift({
      id: "reporting",
      label: "Reporting period",
      kind: "reporting",
      months: 3,
    });
  }
  const roleIds = new Set(roles.map((r) => r.id));
  const reportingId = roles.find((r) => r.kind === "reporting")!.id;

  const drafted = new Map(draft.slides.map((s) => [s.index, s]));
  const patterns = new Map<number, DeckBlueprintSlide>();
  // Per source slide; only the slides that become patterns report theirs
  // (a repeat that is not a pattern was never drafted, by design).
  const slideWarnings = new Map<number, string[]>();
  for (const s of skeleton.slides) {
    const d = drafted.get(s.index);
    const label = `Slide ${s.index + 1}`;
    const warnings: string[] = [];
    slideWarnings.set(s.index, warnings);
    if (s.droppedBlocks > 0) {
      warnings.push(
        `${label}: ${s.droppedBlocks} block(s) beyond the blueprint's ${DECK_BLUEPRINT_MAX_BLOCKS}-block limit were left out.`,
      );
    }
    if (s.emptyFigures > 0) {
      warnings.push(
        `${label}: ${s.emptyFigures} empty figure placeholder(s) had no chart to carry and were left out.`,
      );
    }
    if (s.pattern.type === "cover") {
      patterns.set(s.index, {
        type: "cover",
        titleBrief: d?.titleBrief ?? "",
        subtitleBrief: d?.subtitleBrief || undefined,
        presenterBrief: d?.presenterBrief || undefined,
        dateBrief: d?.dateBrief || undefined,
      });
      continue;
    }
    if (s.pattern.type === "section") {
      patterns.set(s.index, {
        type: "section",
        titleBrief: d?.titleBrief ?? "",
        subtitleBrief: d?.subtitleBrief || undefined,
      });
      continue;
    }
    let k = 0;
    const rows = s.pattern.rows.map((row) =>
      row.map((cell): DeckBlueprintCell => {
        const b = d?.blocks[k++] ?? {};
        const block = cell.block;
        if (block.type === "text") {
          return {
            span: cell.span,
            block: {
              ...block,
              brief: b.brief ?? "",
              keepVerbatim: b.keepVerbatim === true,
              verbatimText: b.keepVerbatim === true
                ? textOfBlock(s, k - 1)
                : undefined,
            },
          };
        }
        if (block.type === "image_slot") {
          return {
            span: cell.span,
            block: { ...block, note: b.note ?? b.brief ?? "" },
          };
        }
        const presets = presetsByMetric[block.metricId] ?? [];
        let vizPresetId = b.vizPresetId ?? "";
        if (!presets.some((p) => p.id === vizPresetId)) {
          if (presets.length === 0) {
            warnings.push(
              `${label}: metric "${block.metricId}" has no presets in this package; the figure keeps no preset and will need one chosen.`,
            );
          } else {
            // The metric's first preset of the source chart's own type, or
            // its first preset.
            const fallback = presets.find((p) => p.type === block.chartType) ??
              presets[0];
            warnings.push(
              `${label}: no valid preset was picked for metric "${block.metricId}"; using "${fallback.id}" (check it).`,
            );
            vizPresetId = fallback.id;
          }
        }
        let period = block.period;
        if (period.kind === "role") {
          const role = b.periodRole && roleIds.has(b.periodRole)
            ? b.periodRole
            : reportingId;
          period = { kind: "role", role };
        }
        return {
          span: cell.span,
          block: {
            ...block,
            vizPresetId: vizPresetId || "unknown",
            purpose: b.purpose ?? "",
            period,
            filterIntent: b.filterIntent || undefined,
            captionBrief: b.captionBrief || undefined,
          },
        };
      })
    );
    patterns.set(s.index, {
      type: "content",
      headerBrief: d?.headerBrief ?? "",
      rows,
      split: s.pattern.split
        ? {
          ...s.pattern.split,
          imageNote: s.pattern.split.imageNote
            ? (d?.imageNote || s.pattern.split.imageNote)
            : undefined,
        }
        : undefined,
    });
  }

  // Topics: every source slide lands in exactly one topic, in deck order. A
  // slide the AI left out gets a topic of its own, so nothing is lost
  // silently; one it put in two topics stays in the first.
  const seen = new Set<number>();
  const placed: {
    first: number;
    sources: number[];
    topic: DeckBlueprint["topics"][number];
  }[] = [];
  const valid = (i: number) =>
    Number.isInteger(i) && i >= 0 && i < skeleton.slides.length;
  for (const t of draft.topics) {
    const indexes = t.sourceSlideIndexes.filter((i) => valid(i) && !seen.has(i))
      .sort((a, b) => a - b);
    if (indexes.length === 0) continue;
    indexes.forEach((i) => seen.add(i));
    const chosen = (t.patternSlideIndexes ?? indexes).filter((i) =>
      indexes.includes(i)
    );
    const use = chosen.length > 0 ? chosen : indexes;
    placed.push({
      first: indexes[0],
      sources: use,
      topic: {
        id: "",
        name: t.name.trim() || `Topic ${placed.length + 1}`,
        purpose: t.purpose,
        scalingRule: t.scalingRule,
        slides: use.map((i) => patterns.get(i)!),
      },
    });
  }
  const orphans = skeleton.slides.map((s) => s.index).filter((i) =>
    !seen.has(i)
  );
  for (const i of orphans) {
    warnings.push(
      `Slide ${i + 1} was not placed in a topic, so it has a topic of its own.`,
    );
    placed.push({
      first: i,
      sources: [i],
      topic: {
        id: "",
        name: `Slide ${i + 1}`,
        purpose: "",
        scalingRule: "One slide.",
        slides: [patterns.get(i)!],
      },
    });
  }
  // Deck order: by each topic's first source slide.
  placed.sort((a, b) => a.first - b.first);
  const used = new Set(placed.flatMap((p) => p.sources));
  for (const [index, ws] of slideWarnings) {
    if (used.has(index)) warnings.push(...ws);
  }
  const topics = placed.map((p, i) => ({ ...p.topic, id: `t${i + 1}` }));

  const parsed = deckBlueprintSchema.safeParse(trimStrings({
    kind: DECK_BLUEPRINT_KIND,
    formatVersion: DECK_BLUEPRINT_FORMAT_VERSION,
    name: draft.name.trim() || skeleton.sourceDeckLabel || "Blueprint",
    description: draft.description,
    createdAt,
    sourceDeckLabel: skeleton.sourceDeckLabel,
    language: "en",
    look: {
      ...skeleton.look,
      footerPattern: skeleton.footerText !== undefined
        ? (draft.footerPattern ?? "")
        : undefined,
      watermarkPattern: skeleton.watermarkText !== undefined
        ? (draft.watermarkPattern ?? "")
        : undefined,
    },
    periodRoles: roles,
    topics,
  }));
  if (!parsed.success) {
    return {
      success: false,
      err: `The drafted blueprint is not valid: ${parsed.error.message}`,
    };
  }
  return {
    success: true,
    data: parsed.data,
    warnings,
    patternSources: placed.map((p) => p.sources),
  };
}

// Every written field cut to the format's bound rather than the whole
// draft refused over one long brief; kept text has its own, larger bound.
const TRIM_BOUNDS: Record<string, number> = {
  name: 200,
  description: 2000,
  sourceDeckLabel: 300,
  verbatimText: 40_000,
};

function trimStrings<T>(value: T, key = ""): T {
  if (typeof value === "string") {
    const max = TRIM_BOUNDS[key] ?? DECK_BLUEPRINT_TEXT_MAX;
    return (value.length > max ? value.slice(0, max) : value) as T;
  }
  if (key === "targetWords" && typeof value === "number") {
    return Math.min(value, 5000) as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => trimStrings(v)) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, trimStrings(v, k)]),
    ) as T;
  }
  return value;
}

function textOfBlock(s: SkeletonSlide, k: number): string | undefined {
  const facts = s.blocks[k];
  return facts?.type === "text" ? facts.text : undefined;
}

// ── The source's own names left in the words ────────────────────────────────

// The words in a source deck that name its country: every admin-area value
// its figures filter on, plus what the caller adds (the instance's country
// name). Indicator, category and other filter values are the same words in
// every country ("Infrastructure", "anc1") and are not collected; short and
// numeric values match too much and are skipped.
export function collectSourceTerms(
  _config: SlideDeckConfig,
  slides: Slide[],
  extra: string[],
): string[] {
  const terms = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v !== "string") return;
    const t = v.trim();
    if (t.length >= 3 && !/^\d+$/.test(t)) terms.add(t);
  };
  extra.forEach(add);
  for (const slide of slides) {
    if (slide.type !== "content") continue;
    for (const block of leaves(slide.layout)) {
      if (block.type !== "figure" || !block.bundle) continue;
      for (const f of block.bundle.config.d.filterBy) {
        if (f.disOpt.startsWith("admin_area_")) f.values.forEach(add);
      }
    }
  }
  return [...terms];
}

export type SourceTermHit = { where: string; term: string };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Every place a source term appears in the blueprint's words. The review
// panel lists them: a brief that names the source's district would write
// that district into every country's deck.
export function findSourceTermHits(
  blueprint: DeckBlueprint,
  terms: string[],
): SourceTermHit[] {
  if (terms.length === 0) return [];
  const res = terms.map((t) => ({
    term: t,
    re: new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegExp(t)}($|[^\\p{L}\\p{N}])`,
      "iu",
    ),
  }));
  const hits: SourceTermHit[] = [];
  const check = (where: string, text: string | undefined) => {
    if (!text) return;
    for (const { term, re } of res) {
      if (re.test(text)) hits.push({ where, term });
    }
  };
  check("Blueprint name", blueprint.name);
  check("Description", blueprint.description);
  check("Footer pattern", blueprint.look.footerPattern);
  check("Watermark pattern", blueprint.look.watermarkPattern);
  for (const topic of blueprint.topics) {
    const at = `Topic "${topic.name}"`;
    check(at, topic.name);
    check(`${at}: purpose`, topic.purpose);
    check(`${at}: scaling rule`, topic.scalingRule);
    topic.slides.forEach((slide, si) => {
      const sat = `${at}, slide ${si + 1}`;
      if (slide.type === "cover" || slide.type === "section") {
        check(sat, slide.titleBrief);
        check(sat, slide.subtitleBrief);
        if (slide.type === "cover") {
          check(sat, slide.presenterBrief);
          check(sat, slide.dateBrief);
        }
        return;
      }
      check(`${sat}: header`, slide.headerBrief);
      for (const block of slide.rows.flat().map((c) => c.block)) {
        if (block.type === "text") {
          check(`${sat}: text brief`, block.brief);
          if (block.keepVerbatim) {
            check(`${sat}: kept text`, block.verbatimText);
          }
        } else if (block.type === "figure") {
          check(`${sat}: figure`, block.purpose);
          check(`${sat}: figure`, block.filterIntent);
          check(`${sat}: figure`, block.captionBrief);
        } else {
          check(`${sat}: image`, block.note);
        }
      }
    });
  }
  return hits;
}

// ── Periods ─────────────────────────────────────────────────────────────────

// YYYYMM arithmetic on 12-month years: the period ids a figure filters on.
export function addMonths(yyyymm: number, delta: number): number {
  const y = Math.floor(yyyymm / 100);
  const m = (yyyymm % 100) - 1 + delta;
  const ny = y + Math.floor(m / 12);
  const nm = ((m % 12) + 12) % 12 + 1;
  return ny * 100 + nm;
}

export function monthsBetween(start: number, end: number): number {
  const a = Math.floor(start / 100) * 12 + (start % 100);
  const b = Math.floor(end / 100) * 12 + (end % 100);
  return b - a + 1;
}

export function isValidYearMonth(v: number): boolean {
  const m = v % 100;
  return Number.isInteger(v) && v >= 190001 && v <= 299912 && m >= 1 &&
    m <= 12;
}

// Every role resolved from the reporting period: a comparison period is the
// same months a year earlier; a trend window of N months ends where the
// reporting period ends.
export function resolvePeriodRoles(
  roles: DeckBlueprintPeriodRole[],
  reporting: { start: number; end: number },
): ResolvedBlueprintPeriod[] {
  return roles.map((role) => {
    if (role.kind === "reporting") {
      return {
        roleId: role.id,
        label: role.label,
        start: reporting.start,
        end: reporting.end,
      };
    }
    if (role.kind === "comparison") {
      return {
        roleId: role.id,
        label: role.label,
        start: addMonths(reporting.start, -12),
        end: addMonths(reporting.end, -12),
      };
    }
    const months = role.months ?? 12;
    return {
      roleId: role.id,
      label: role.label,
      start: addMonths(reporting.end, -(months - 1)),
      end: reporting.end,
    };
  });
}

export function formatYearMonth(v: number): string {
  return `${Math.floor(v / 100)}-${String(v % 100).padStart(2, "0")}`;
}

export function formatPeriodRange(p: { start: number; end: number }): string {
  return p.start === p.end
    ? formatYearMonth(p.start)
    : `${formatYearMonth(p.start)} to ${formatYearMonth(p.end)}`;
}

// ── The look, on the target ─────────────────────────────────────────────────

export function fillLookPattern(
  pattern: string,
  fill: { country: string; period: string; year: string },
): string {
  return pattern
    .replaceAll("{Country}", fill.country)
    .replaceAll("{Period}", fill.period)
    .replaceAll("{Year}", fill.year);
}

// The target deck's config under the blueprint's look. The deck's own logos
// and replicant stay: logos are the target's assets.
export function deckConfigWithLook(
  current: SlideDeckConfig,
  look: DeckBlueprintLook,
  fill: { country: string; period: string; year: string },
): SlideDeckConfig {
  return {
    ...current,
    theme: look.theme,
    themeChosen: true,
    headerSize: look.headerSize,
    showPageNumbers: look.showPageNumbers,
    useWatermark: look.useWatermark,
    watermarkText: look.watermarkPattern !== undefined
      ? fillLookPattern(look.watermarkPattern, fill)
      : current.watermarkText,
    globalFooterText: look.footerPattern !== undefined
      ? fillLookPattern(look.footerPattern, fill)
      : current.globalFooterText,
    logos: {
      ...current.logos,
      cover: {
        ...current.logos.cover,
        showByDefault: look.logoSlots.cover.showByDefault,
      },
      header: {
        ...current.logos.header,
        showByDefault: look.logoSlots.header.showByDefault,
      },
      footer: {
        ...current.logos.footer,
        showByDefault: look.logoSlots.footer.showByDefault,
      },
    },
  };
}

// ── Files and the record ────────────────────────────────────────────────────

export type ParseBlueprintResult =
  | { success: true; data: DeckBlueprint }
  | { success: false; err: string };

export function parseDeckBlueprintFile(text: string): ParseBlueprintResult {
  const raw = parseJsonOrUndefined<Record<string, unknown>>(text);
  if (raw === undefined || typeof raw !== "object" || raw === null) {
    return { success: false, err: "This file is not a blueprint file." };
  }
  if (raw.kind !== DECK_BLUEPRINT_KIND) {
    return { success: false, err: "This file is not a deck blueprint." };
  }
  if (raw.formatVersion !== DECK_BLUEPRINT_FORMAT_VERSION) {
    return {
      success: false,
      err: `This blueprint was made by a different version of FASTR (format ${
        String(raw.formatVersion)
      }); this version reads format ${DECK_BLUEPRINT_FORMAT_VERSION}.`,
    };
  }
  const parsed = deckBlueprintSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      err: `This blueprint file is damaged: ${parsed.error.issues[0]?.message}`,
    };
  }
  return { success: true, data: parsed.data };
}

export function serializeDeckBlueprint(blueprint: DeckBlueprint): string {
  return JSON.stringify(deckBlueprintSchema.parse(blueprint), null, 2);
}

export function deckBlueprintFileName(blueprint: DeckBlueprint): string {
  const base = blueprint.name.trim().replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "").slice(0, 80) || "blueprint";
  return `${base}.fastr-blueprint.json`;
}

// The blueprint a deck was built from, or undefined: the plan column of a
// deck built from none is empty, and anything else in it is not this.
export function readDeckBlueprintProvenance(
  plan: string,
): DeckBlueprintProvenance | undefined {
  if (!plan) return undefined;
  const raw = parseJsonOrUndefined<{ kind?: unknown }>(plan);
  if (raw?.kind !== DECK_BLUEPRINT_PROVENANCE_KIND) return undefined;
  const parsed = deckBlueprintProvenanceSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

// How many slides a blueprint's patterns hold, and how many figures.
export function countBlueprint(blueprint: DeckBlueprint): {
  topics: number;
  slides: number;
  figures: number;
} {
  let slides = 0;
  let figures = 0;
  for (const t of blueprint.topics) {
    for (const s of t.slides) {
      slides++;
      if (s.type === "content") {
        figures += s.rows.flat().filter((c) => c.block.type === "figure")
          .length;
      }
    }
  }
  return { topics: blueprint.topics.length, slides, figures };
}
