import {
  COPILOT_TOOL_VIEWS,
  DECK_BLUEPRINT_MAX_BLOCKS,
  DECK_BLUEPRINT_PROVENANCE_KIND,
  type DeckBlueprint,
  deckBlueprintOutlineTopicSchema,
  type DeckBlueprintProvenance,
  deckConfigWithLook,
  formatPeriodRange,
  getCountryLabel,
  isUntouchedDeck,
  isValidYearMonth,
  monthsBetween,
  type ResolvedBlueprintPeriod,
  resolvePeriodRoles,
  type SlideDeckConfig,
  t3,
} from "lib";
import { AIToolFailure, type AnyAITool, createAITool } from "panther";
import { z } from "zod";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { getSlideFromCacheOrFetch } from "~/state/products/t2_slides";
import {
  copilotViewController,
  copilotViews,
  type EditingSlideDeckContext,
} from "~/components/instance/copilot/mod.ts";
import {
  type DeckBlueprintRun,
  deckBlueprintRunFor,
} from "~/components/products/_shared/mod.ts";
import {
  BlueprintOutlineCard,
  type BlueprintOutlineDecision,
  type BlueprintOutlineDeckState,
  type BlueprintOutlineInput,
} from "./blueprint_outline_card.tsx";

// Applying a deck blueprint (lib/types/_deck_blueprint.ts) through the chat:
// the person starts a run from the deck (slide_deck/blueprint), and the
// model reads it with get_blueprint_run, checks this deck's data, proposes
// the outline on a card (propose_blueprint_outline), and on the person's
// Build writes the slides with create_slide. The card is the confirmation:
// nothing is written before Build, and Build makes the version checkpoint,
// the look, the deletions and the deck's record of the run itself, without
// the model.

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  pt: "Portuguese",
  th: "Thai",
};

function runOrThrow(deckId: string): DeckBlueprintRun {
  const run = deckBlueprintRunFor(deckId);
  if (!run) {
    throw new AIToolFailure(
      "No blueprint is being applied to this deck. The person starts one from the deck's File menu (Apply blueprint…) or from the AI panel's menu.",
    );
  }
  return run;
}

async function readDeckState(
  deckId: string,
  context: EditingSlideDeckContext,
): Promise<BlueprintOutlineDeckState> {
  const ids = context.getSlideIds();
  const config = context.getDeckConfig();
  let untouched = ids.length === 0;
  if (ids.length === 1) {
    const open = context.getOpenSlide();
    if (open?.slideId === ids[0]) {
      untouched = isUntouchedDeck([open.getDraft()]);
    } else {
      const res = await getSlideFromCacheOrFetch(deckId, ids[0]);
      untouched = res.success && isUntouchedDeck([res.data.slide]);
    }
  }
  return {
    slideCount: ids.length,
    untouched,
    themeChosen: config.themeChosen !== false && ids.length > 0,
  };
}

function reportingLength(blueprint: DeckBlueprint): number {
  return blueprint.periodRoles.find((r) => r.kind === "reporting")?.months ??
    3;
}

// The run as the model reads it: what to do, in order, then the blueprint.
function describeRun(
  run: DeckBlueprintRun,
  deckLabel: string,
  state: BlueprintOutlineDeckState,
): string {
  const bp = run.blueprint;
  const lang = LANGUAGE_NAMES[instanceState.instanceLanguage] ??
    instanceState.instanceLanguage;
  const months = reportingLength(bp);
  const period = run.period.mode === "chosen"
    ? `The person chose the reporting period ${
      formatPeriodRange(run.period)
    } (start ${run.period.start}, end ${run.period.end}). Use exactly this.`
    : `The person asked for the latest complete reporting period: find, with get_metric_data on the main metrics the topics use, the latest run of ${months} whole month(s) that has data in this package, and use it.`;
  const deck = state.slideCount === 0 || state.untouched
    ? "The deck is empty (or holds only the untouched default cover)."
    : `The deck already has ${state.slideCount} slide(s); the outline card will ask the person whether to replace them or add after them.`;
  return [
    `# Applying the deck blueprint "${bp.name}" to the deck "${deckLabel}"`,
    "",
    `The blueprint was made from the deck "${bp.sourceDeckLabel}" in another country. It carries topics, slide patterns (layout, figure metric + preset, a writing brief per text block) and the look. It carries none of that country's data: build everything from THIS deck's results package.`,
    "",
    deck,
    "",
    "## Steps",
    "1. Check this package's data before deciding anything: get_available_metrics, then get_metric_data for the metrics the topics use, with the disaggregations their scaling rules and filterIntents talk about (regions, indicators). Never assume the source country's regions, indicators or results hold here.",
    `2. Reporting period. ${period} Period roles resolve from it: a comparison role is the same months a year earlier; a trend role is its \`months\` long, ending where the reporting period ends.`,
    "3. For every topic, apply its scaling rule to this data: how many slides (0 drops the topic), and what each slide is about. Keep the topics in the blueprint's order.",
    "4. For every figure: is its metric in this package, with its preset (get_available_metrics lists both)? Do the filter values its filterIntent needs exist here? If not, propose a stand-in (a metric or preset with the same purpose) or drop that figure. Never swap one without listing it as a stand-in.",
    "5. Call propose_blueprint_outline ONCE, with every topic, and wait. The person approves or edits it on a card and presses Build; the tool result is the approved outline and the resolved periods. If they cancel, stop and ask what to change.",
    "6. Then create the approved slides in order, one create_slide call per slide, each with position { toEnd: true }:",
    "   - cover / section: write title and subtitle from the briefs.",
    `   - content: copy the pattern's grid into layoutRows (the spans of each row; blocks in reading order, row by row) so the slide keeps the source's layout, and the pattern's split into split. At most ${DECK_BLUEPRINT_MAX_BLOCKS} blocks.`,
    "   - figure: from_metric with the pattern's metricId and vizPresetId (or the approved stand-in); period kind 'role' → startDate/endDate from that role's resolved period; 'relative' → relativePeriod as given; 'preset' → neither. Turn filterIntent into filters / selectedReplicant for this slide's subject, with values that exist in this data. chartTitle from the captionBrief (or a short title) in the deck's language.",
    "   - text: write it fresh from the brief, from this deck's data, at about targetWords words. keepVerbatim → copy verbatimText exactly (translated faithfully when the deck's language differs).",
    "   - image_slot: a text block reading 'Add image: <note>', so the person sees where the source had a picture.",
    `7. Write every word in ${lang}. Never copy the source country's names, numbers or findings.`,
    "8. Finish with a short summary: slides built per topic, topics dropped and why, stand-ins used, translated word-for-word blocks to check, and what the person still has to add (logos: the blueprint's logo slots; images).",
    "",
    "## The blueprint",
    "```json",
    JSON.stringify(bp),
    "```",
  ].join("\n");
}

const outlineInputSchema = z.object({
  reportingPeriod: z.object({
    start: z.number().int().describe("First month, YYYYMM (e.g. 202507)."),
    end: z.number().int().describe("Last month, YYYYMM (e.g. 202509)."),
  }).describe(
    "The reporting period every period role resolves from: the one the person chose, or the latest complete one you found in the data.",
  ),
  topics: z.array(
    deckBlueprintOutlineTopicSchema.extend({
      topicId: z.string().describe("The blueprint topic's id (t1, t2, …)."),
      slideCount: z.number().int().min(0).max(30).describe(
        "Slides planned for this topic in THIS deck; 0 drops it.",
      ),
      reason: z.string().describe(
        "Why this many, from this deck's data, in one or two sentences the person reads (e.g. '3 regions are below 70%: Bo, Kenema, Port Loko').",
      ),
      slideNotes: z.array(z.string()).optional().describe(
        "One short line per planned slide: what it is about.",
      ),
      standIns: z.array(z.object({
        original: z.string().describe(
          "What the blueprint asked for (metric, preset, filter or map level).",
        ),
        replacement: z.string().describe(
          "What you propose instead, or 'drop this figure'.",
        ),
        reason: z.string(),
      })).optional().describe(
        "Every figure that cannot be built as the blueprint says.",
      ),
      translatedVerbatim: z.boolean().optional().describe(
        "True when a keep-word-for-word block of this topic will be translated.",
      ),
    }),
  ).min(1).describe(
    "Every topic of the blueprint, in its order, each exactly once.",
  ),
});

type OutlineToolInput = z.infer<typeof outlineInputSchema>;

function checkOutline(input: OutlineToolInput, bp: DeckBlueprint): void {
  const { start, end } = input.reportingPeriod;
  if (!isValidYearMonth(start) || !isValidYearMonth(end) || start > end) {
    throw new AIToolFailure(
      `reportingPeriod must be two YYYYMM months in order; got ${start} to ${end}.`,
    );
  }
  if (monthsBetween(start, end) > 60) {
    throw new AIToolFailure("reportingPeriod is longer than five years.");
  }
  const ids = bp.topics.map((t) => t.id);
  const given = input.topics.map((t) => t.topicId);
  const unknown = given.filter((id) => !ids.includes(id));
  const missing = ids.filter((id) => !given.includes(id));
  const twice = given.filter((id, i) => given.indexOf(id) !== i);
  if (unknown.length > 0 || missing.length > 0 || twice.length > 0) {
    throw new AIToolFailure(
      [
        unknown.length > 0 ? `Unknown topic id(s): ${unknown.join(", ")}.` : "",
        missing.length > 0 ? `Missing topic id(s): ${missing.join(", ")}.` : "",
        twice.length > 0
          ? `Topic id(s) listed twice: ${twice.join(", ")}.`
          : "",
        `List every topic exactly once: ${ids.join(", ")}.`,
      ].filter(Boolean).join(" "),
    );
  }
}

// Build, before the model writes a slide: the checkpoint (only when slides
// with content are replaced), the look, then the deletions, read from the
// server after the look is saved (a deck whose first theme question was
// never answered gets the default cover with its first theme, which
// replacing removes too), then the deck's record of the run.
async function prepareDeck(
  deckId: string,
  context: EditingSlideDeckContext,
  run: DeckBlueprintRun,
  state: BlueprintOutlineDeckState,
  decision: BlueprintOutlineDecision,
  periods: ResolvedBlueprintPeriod[],
): Promise<string[]> {
  const done: string[] = [];
  const replace = decision.placement === "replace";
  if (replace && state.slideCount > 0 && !state.untouched) {
    const cp = await serverActions.checkpointSlideDeck({ product_id: deckId });
    if (!cp.success) {
      throw new AIToolFailure(
        `Nothing was changed: the version before replacing could not be saved (${cp.err}).`,
      );
    }
    done.push(
      cp.data.created
        ? "Saved the deck as it was to its version history."
        : "The deck as it was is already its newest version in the history.",
    );
  }
  if (decision.useLook) {
    const reporting = periods.find((p) =>
      run.blueprint.periodRoles.find((r) =>
        r.id === p.roleId
      )?.kind ===
        "reporting"
    ) ?? periods[0];
    const next: SlideDeckConfig = deckConfigWithLook(
      context.getDeckConfig(),
      run.blueprint.look,
      {
        country: getCountryLabel(instanceState.countryIso3 ?? "") ||
          instanceState.instanceName,
        period: reporting ? formatPeriodRange(reporting) : "",
        year: reporting ? String(Math.floor(reporting.end / 100)) : "",
      },
    );
    if (!(await context.patchDeckConfig(next))) {
      throw new AIToolFailure(
        "The blueprint's look could not be saved, so nothing else was changed. Ask the person to try Build again.",
      );
    }
    done.push(`Applied the blueprint's look (theme "${next.theme}").`);
  }
  if (replace) {
    const detail = await serverActions.getSlideDeckDetail({
      product_id: deckId,
    });
    if (!detail.success) throw new AIToolFailure(detail.err);
    const ids = detail.data.slideIds;
    if (ids.length > 0) {
      const del = await context.deleteSlides(ids);
      if (!del.success) {
        throw new AIToolFailure(
          `The existing slides could not be removed (${del.err}). ${
            done.join(" ")
          }`,
        );
      }
      for (const id of del.data.deletedIds) {
        copilotViewController.markAIEdit(`slide:${id}`);
      }
      done.push(`Removed the ${del.data.deletedIds.length} existing slide(s).`);
    }
  }
  const record: DeckBlueprintProvenance = {
    kind: DECK_BLUEPRINT_PROVENANCE_KIND,
    blueprintName: run.blueprint.name,
    formatVersion: run.blueprint.formatVersion,
    appliedAt: new Date().toISOString(),
    appliedBy: instanceState.currentUserEmail || undefined,
    periods,
    placement: decision.placement,
    usedBlueprintLook: decision.useLook,
    outline: decision.topics,
    blueprint: run.blueprint,
  };
  const saved = await serverActions.updateSlideDeckPlan({
    product_id: deckId,
    plan: JSON.stringify(record),
  });
  // The record is the deck's note of where it came from: losing it does not
  // stop the build, and the model says so.
  if (!saved.success) {
    done.push(
      `(The deck's note of this blueprint could not be saved: ${saved.err}.)`,
    );
  }
  copilotViewController.markAIEdit(`product:${deckId}`);
  return done;
}

function describeDecision(
  decision: BlueprintOutlineDecision,
  bp: DeckBlueprint,
  periods: ResolvedBlueprintPeriod[],
  done: string[],
): string {
  const lines = [
    "The person approved the outline and pressed Build.",
    ...done,
    "",
    "Resolved periods (use these for every figure's period role):",
    ...periods.map((p) =>
      `- ${p.roleId} (${p.label}): startDate ${p.start}, endDate ${p.end}`
    ),
    "",
    "Approved outline (build exactly this, in this order):",
  ];
  for (const t of decision.topics) {
    const name = bp.topics.find((b) => b.id === t.topicId)?.name ?? t.topicId;
    if (t.slideCount === 0) {
      lines.push(`- ${t.topicId} "${name}": DROPPED. Build nothing for it.`);
      continue;
    }
    lines.push(
      `- ${t.topicId} "${name}": ${t.slideCount} slide(s). ${t.reason}`,
    );
    for (const note of t.slideNotes ?? []) lines.push(`    • ${note}`);
    for (const s of t.standIns ?? []) {
      lines.push(
        s.accepted === false
          ? `    ✗ Stand-in REJECTED: "${s.original}" → "${s.replacement}". Drop that figure instead.`
          : `    ✓ Stand-in accepted: "${s.original}" → "${s.replacement}".`,
      );
    }
  }
  lines.push(
    "",
    "Now create the slides with create_slide, position { toEnd: true }, one at a time, as the blueprint's patterns say.",
  );
  return lines.join("\n");
}

export function getClientToolsForDeckBlueprints(): AnyAITool[] {
  // One pending decision per call, keyed by its tool_use id, as panther's
  // ask_user_questions keys its own.
  const pending = new Map<
    string,
    {
      answer: (d: BlueprintOutlineDecision) => void;
      cancel: (reason: string) => void;
    }
  >();

  const getRun = createAITool({
    viewRegistry: copilotViews,
    name: "get_blueprint_run",
    description:
      "Read the deck blueprint the person asked to apply to this deck: the steps to follow, the chosen reporting period and the blueprint itself (topics, scaling rules, slide patterns, look). Call it first whenever the person asks to apply a blueprint.",
    inputSchema: z.object({}),
    availableIn: COPILOT_TOOL_VIEWS.get_blueprint_run,
    kind: "read",
    handler: async (_input, view) => {
      const run = runOrThrow(view.params.deckId);
      const state = await readDeckState(view.params.deckId, view.context);
      return describeRun(run, view.context.getDeckLabel(), state);
    },
    inProgressLabel: "Reading the blueprint...",
    completionMessage: () => "Read the blueprint",
  });

  const propose = createAITool({
    viewRegistry: copilotViews,
    name: "propose_blueprint_outline",
    description:
      "Show the person the outline you propose for applying the blueprint to this deck: the reporting period, and for every topic the number of slides (0 drops it), why, a line per slide, and any figure stand-ins. The person edits it on a card and presses Build (or Cancel). On Build the deck is prepared (a version saved first when slides are replaced, the blueprint's look if they keep it on, old slides removed when replacing) and the result gives the approved outline and the resolved periods; then create the slides. Call it once per run, alone in its response.",
    inputSchema: outlineInputSchema,
    availableIn: COPILOT_TOOL_VIEWS.propose_blueprint_outline,
    kind: "write",
    handler: async (input, view, ctx) => {
      const deckId = view.params.deckId;
      const run = runOrThrow(deckId);
      checkOutline(input, run.blueprint);
      const periods = resolvePeriodRoles(
        run.blueprint.periodRoles,
        input.reportingPeriod,
      );
      let onAbort = () => {};
      let decision: BlueprintOutlineDecision;
      try {
        decision = await new Promise<BlueprintOutlineDecision>(
          (resolve, reject) => {
            const cancel = (reason: string) =>
              reject(new AIToolFailure(reason));
            if (ctx.signal.aborted) {
              cancel("Outline cancelled: generation was stopped.");
              return;
            }
            pending.set(ctx.toolUseId, { answer: resolve, cancel });
            onAbort = () =>
              cancel("Outline cancelled: generation was stopped.");
            ctx.signal.addEventListener("abort", onAbort, { once: true });
          },
        );
      } finally {
        pending.delete(ctx.toolUseId);
        ctx.signal.removeEventListener("abort", onAbort);
      }
      // The deck the card was answered over, read again: the person may
      // have changed it while the card waited.
      const state = await readDeckState(deckId, view.context);
      const done = await prepareDeck(
        deckId,
        view.context,
        run,
        state,
        decision,
        periods,
      );
      return describeDecision(decision, run.blueprint, periods, done);
    },
    inProgressComponent: (
      p: { input: OutlineToolInput; toolUseId: string },
    ) => (
      <BlueprintOutlineCard
        input={p.input as BlueprintOutlineInput}
        loadContext={async () => {
          const view = copilotViewController.current();
          if (view.id !== "editing_slide_deck") return undefined;
          const run = deckBlueprintRunFor(view.params.deckId);
          if (!run) return undefined;
          return {
            blueprint: run.blueprint,
            state: await readDeckState(view.params.deckId, view.context),
          };
        }}
        onSubmit={(d) => pending.get(p.toolUseId)?.answer(d)}
        onCancel={() =>
          pending.get(p.toolUseId)?.cancel(
            "The person cancelled the outline. Nothing was changed. Ask what they want to change.",
          )}
      />
    ),
    inProgressLabel: t3({
      en: "Waiting for you to review the outline...",
      fr: "En attente de votre validation du plan...",
      pt: "A aguardar a sua revisão do plano...",
    }),
    completionMessage: () => "Outline approved, deck prepared",
  });
  // Engine-managed card, as ask_user_questions: created when its block
  // starts, answered by Build or Cancel, cancelled by Stop.
  propose.metadata.awaitsUserAction = true;

  return [getRun, propose];
}
