import {
  formatPeriodRange,
  type MetricWithStatus,
  type SlideDeckConfig,
  t3,
} from "lib";
import { openAlert, openComponent } from "panther";
import {
  type OpenSlide,
  requestCopilotPrompt,
} from "~/components/instance/copilot/mod.ts";
import { startDeckBlueprintRun } from "~/components/products/_shared/mod.ts";
import { loadDeckSlides } from "./draft.ts";
import { DraftingModal } from "./drafting_modal.tsx";
import { BlueprintFileModal } from "./file_modal.tsx";
import { BlueprintReviewModal } from "./review_modal.tsx";

type DeckArgs = {
  deckId: string;
  deckLabel: string;
  config: SlideDeckConfig;
  slideIds: string[];
  openSlide: OpenSlide | undefined;
  metrics: MetricWithStatus[];
};

// File › Make blueprint…: draft from this deck, review, download.
export async function openMakeBlueprint(args: DeckArgs): Promise<void> {
  let slides;
  try {
    slides = await loadDeckSlides(args.deckId, args.slideIds, args.openSlide);
  } catch (e) {
    await openAlert({
      text: e instanceof Error ? e.message : String(e),
      intent: "danger",
    });
    return;
  }
  const drafted = await openComponent({
    element: DraftingModal,
    props: {
      deckLabel: args.deckLabel,
      config: args.config,
      slides,
      metrics: args.metrics,
    },
  });
  if (!drafted) return;
  const presetOptions: Record<string, { value: string; label: string }[]> = {};
  for (const m of args.metrics) {
    presetOptions[m.id] = (m.vizPresets ?? []).map((pr) => ({
      value: pr.id,
      label: t3(pr.label),
    }));
  }
  await openComponent({
    element: BlueprintReviewModal,
    props: {
      mode: "make" as const,
      blueprint: drafted.blueprint,
      warnings: drafted.warnings,
      sourceTerms: drafted.sourceTerms,
      sourceSlides: drafted.sourceSlides,
      sourceConfig: args.config,
      patternSources: drafted.patternSources,
      presetOptions,
    },
  });
}

// File › Apply blueprint… (and the AI panel's menu): choose the file,
// review it, pick the period, then the copilot runs it in this deck. The
// run starts a new conversation so the blueprint is the whole context.
export async function openApplyBlueprint(args: {
  deckId: string;
  deckLabel: string;
}): Promise<void> {
  const blueprint = await openComponent({
    element: BlueprintFileModal,
    props: { deckLabel: args.deckLabel },
  });
  if (!blueprint) return;
  const reviewed = await openComponent({
    element: BlueprintReviewModal,
    props: {
      mode: "apply" as const,
      blueprint,
      warnings: [],
      sourceTerms: [],
      patternSources: [],
    },
  });
  if (!reviewed) return;
  startDeckBlueprintRun({
    deckId: args.deckId,
    blueprint: reviewed.blueprint,
    period: reviewed.period,
    startedAt: new Date().toISOString(),
  });
  const period = reviewed.period.mode === "chosen"
    ? formatPeriodRange(reviewed.period)
    : t3({
      en: "the latest complete period in the data",
      fr: "la dernière période complète des données",
      pt: "o último período completo dos dados",
    });
  requestCopilotPrompt(
    t3({
      en:
        `Apply the blueprint "${reviewed.blueprint.name}" to this deck, for ${period}. Read it with get_blueprint_run first.`,
      fr:
        `Applique le modèle « ${reviewed.blueprint.name} » à cette présentation, pour ${period}. Lis-le d'abord avec get_blueprint_run.`,
      pt:
        `Aplica o modelo "${reviewed.blueprint.name}" a esta apresentação, para ${period}. Lê-o primeiro com get_blueprint_run.`,
    }),
    { newConversation: true },
  );
}
