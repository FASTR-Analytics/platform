import {
  assembleBlueprint,
  blueprintDraftFromOutput,
  buildBlueprintSkeleton,
  collectSourceTerms,
  DECK_BLUEPRINT_DRAFT_SYSTEM,
  type DeckBlueprint,
  deckBlueprintDraftOutputSchema,
  describeDeckForBlueprintDraft,
  findSourceTermHits,
  getCountryLabel,
  type MetricWithStatus,
  type Slide,
  type SlideDeckConfig,
  type SourceTermHit,
} from "lib";
import { callAIStructured } from "panther";
import { createAiProxyClient } from "~/components/_shared/mod.ts";
import { instanceState } from "~/state/instance/t1_store";
import { getSlideFromCacheOrFetch } from "~/state/products/t2_slides";

// "Make blueprint" from an open deck: every slide read, the deterministic
// skeleton built in lib (buildBlueprintSkeleton), ONE structured model call
// for the judgement (topics, briefs, presets, period roles, patterns), merged
// back by assembleBlueprint, which accepts only words and ids it offered.
// What the person then reviews is the result, its warnings and the places
// the source's names were left in the words.

export type DraftedBlueprint = {
  blueprint: DeckBlueprint;
  warnings: string[];
  hits: SourceTermHit[];
  sourceTerms: string[];
  // The source slides, by index, and per topic the source index of each of
  // its patterns, for the review panel's thumbnails.
  sourceSlides: Slide[];
  patternSources: (number | undefined)[][];
};

export async function loadDeckSlides(
  deckId: string,
  slideIds: string[],
  openSlide: { slideId: string; getDraft: () => Slide } | undefined,
): Promise<Slide[]> {
  return await Promise.all(slideIds.map(async (id) => {
    if (openSlide?.slideId === id) return openSlide.getDraft();
    const res = await getSlideFromCacheOrFetch(deckId, id);
    if (!res.success) throw new Error(res.err);
    return res.data.slide;
  }));
}

export async function draftBlueprintFromDeck(args: {
  deckLabel: string;
  config: SlideDeckConfig;
  slides: Slide[];
  metrics: MetricWithStatus[];
  signal: AbortSignal;
}): Promise<DraftedBlueprint> {
  if (args.slides.length === 0) {
    throw new Error("This deck has no slides to make a blueprint from.");
  }
  const skeleton = buildBlueprintSkeleton({
    deckLabel: args.deckLabel,
    config: args.config,
    slides: args.slides,
  });
  const res = await callAIStructured(
    {
      sdkClient: createAiProxyClient(),
      system: () => DECK_BLUEPRINT_DRAFT_SYSTEM,
    },
    [{
      role: "user",
      content: describeDeckForBlueprintDraft(
        skeleton,
        args.slides,
        args.metrics,
      ),
    }],
    deckBlueprintDraftOutputSchema,
    { signal: args.signal },
  );
  if (res.data === null) {
    throw new Error(
      res.stopReason === "max_tokens"
        ? "The deck is too long for one draft. Split it into smaller decks and make a blueprint from each."
        : "The AI's draft could not be read. Please try again.",
    );
  }
  const presetsByMetric: Record<string, string[]> = {};
  for (const m of args.metrics) {
    presetsByMetric[m.id] = (m.vizPresets ?? []).map((p) => p.id);
  }
  const assembled = assembleBlueprint(
    skeleton,
    blueprintDraftFromOutput(res.data),
    presetsByMetric,
    new Date().toISOString(),
  );
  if (!assembled.success) throw new Error(assembled.err);
  const sourceTerms = collectSourceTerms(args.config, args.slides, [
    instanceState.instanceName,
    getCountryLabel(instanceState.countryIso3 ?? ""),
  ]);
  return {
    blueprint: assembled.data,
    warnings: assembled.warnings,
    hits: findSourceTermHits(assembled.data, sourceTerms),
    sourceTerms,
    sourceSlides: args.slides,
    patternSources: assembled.patternSources,
  };
}
