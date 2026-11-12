import {
  assembleBlueprint,
  type BlueprintDraftProgress,
  buildBlueprintSkeleton,
  collectSourceTerms,
  type DeckBlueprint,
  findSourceTermHits,
  getCountryLabel,
  type MetricWithStatus,
  runBlueprintDraft,
  type Slide,
  type SlideDeckConfig,
  type SourceTermHit,
} from "lib";
import { callAIStructured } from "panther";
import { createAiProxyClient } from "~/components/_shared/mod.ts";
import { instanceState } from "~/state/instance/t1_store";
import { getSlideFromCacheOrFetch } from "~/state/products/t2_slides";

// "Make blueprint" from an open deck: every slide read, the deterministic
// skeleton built in lib (buildBlueprintSkeleton), the structured model calls
// for the judgement (runBlueprintDraft: topics, then briefs in batches),
// merged back by assembleBlueprint, which accepts only words and ids it
// offered.
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
  onProgress?: (p: BlueprintDraftProgress) => void;
}): Promise<DraftedBlueprint> {
  if (args.slides.length === 0) {
    throw new Error("This deck has no slides to make a blueprint from.");
  }
  const skeleton = buildBlueprintSkeleton({
    deckLabel: args.deckLabel,
    config: args.config,
    slides: args.slides,
  });
  const sdkClient = createAiProxyClient();
  const draft = await runBlueprintDraft({
    skeleton,
    slides: args.slides,
    metrics: args.metrics,
    call: async (system, user, schema) => {
      const res = await callAIStructured(
        { sdkClient, system: () => system },
        [{ role: "user", content: user }],
        schema,
        { signal: args.signal },
      );
      return { data: res.data, stopReason: res.stopReason };
    },
    onProgress: args.onProgress,
  });
  const presetsByMetric: Record<string, { id: string; type: string }[]> = {};
  for (const m of args.metrics) {
    presetsByMetric[m.id] = (m.vizPresets ?? []).map((p) => ({
      id: p.id,
      type: p.config.d.type,
    }));
  }
  const assembled = assembleBlueprint(
    skeleton,
    draft,
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
