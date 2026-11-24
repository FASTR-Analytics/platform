import {
  applyReportDraftEdits,
  readReportText,
  replaceReportText,
  type ReportEmbedIds,
  reportSkippedNote,
  type ReportTextEdit,
  rewriteReportBody,
  rewriteReportSection,
} from "report-forge/ai";
import { AIToolFailure, createAITool } from "panther";
import {
  type AiFigureFromMetric,
  buildReportEmbedToken,
  collapseFastrBlankRuns,
  copilotToolContract,
  fastrPageTemplatesLookup,
  type FastrReportTheme,
  type FigureBlock,
  type FigureBundle,
  findReportEmbeds,
  getDataFromConfig,
  getFastrReportTheme,
  getReplicateByProp,
  insertAfterReportHeading,
  type MetricWithStatus,
  type PeriodBounds,
  periodFilterHasBounds,
  replaceReportEmbedTokens,
  reportLiveFigures,
  resolveFigureMetric,
  type ResultsValueInfoForPresentationObject,
  rewriteReportEmbedToken,
  t3,
  type TranslatableString,
} from "lib";
import { FASTR_PAGE_MUST_FIX, reportBackboneAllowsPlain } from "lib";
import {
  applyFigureConfigPatch,
  assertNoSlotCollision,
  describeFigureConfigPatchEffect,
  resolveBundleFromMetricAndConfig,
  validateFigureConfigEdit,
} from "~/generate_visualization/mod";
import { getResultsValueInfoForPresentationObjectFromCacheOrFetch } from "~/state/products/t2_figure_data";
import { getReportDetailFromCacheOrFetch } from "~/state/products/t2_report_detail";
import { describeReportPages } from "./report_page_map";
import { createGetReportFigureImagesTool } from "./get_report_figure_images.ts";
import { resolveLogoUrl } from "~/generate_slide_deck/fastr_logos";
import {
  copilotViewController,
  copilotViews,
} from "~/components/instance/copilot/mod.ts";
import { resolveFigureFromMetric } from "../../slide_ai/mod.ts";
import {
  editFigureMetricForAI,
  formatFigureConfigForAI,
  readFigureMetricForAI,
} from "../../_shared/mod.ts";
import { validateMetricInputs } from "lib";
import type {
  ClientAIToolEnv,
  EditingReportContext,
} from "~/components/instance/copilot/mod.ts";
import {
  validateReportBodyLength,
  validateReportTokensResolve,
} from "../validators/mod.ts";

// The text tools (rewrite_report, rewrite_section, replace_text and the body
// half of get_report_editor) run on Report Forge's own operations
// (report-forge/ai): one implementation of each edit and of the checks a
// proposed body must pass, shared with any other host of the editor. What
// stays here is the platform's: the approval flow, and everything about
// figures.

// The ids a proposed body may embed: the report's own figures and images.
// The FULL registry, deliberately, not `reportLiveFigures`: a proposed body may
// re-embed a still-registered id that the current body does not reference.
function embedIdsOf(ctx: EditingReportContext): ReportEmbedIds {
  return {
    figures: Object.keys(ctx.getFigures()),
    images: Object.keys(ctx.getImages()),
  };
}

// The figures the reader can see: lib/report_live_figures.ts.
function liveFiguresOf(
  ctx: EditingReportContext,
): Record<string, FigureBlock> {
  return reportLiveFigures(ctx.getBody(), ctx.getFigures());
}

function liveFigureOrRefuse(
  ctx: EditingReportContext,
  figureId: string,
): FigureBlock {
  const live = liveFiguresOf(ctx);
  const fig = live[figureId];
  if (!fig) {
    const ids = Object.keys(live).join(", ") || "(none)";
    throw new AIToolFailure(
      `No figure with id "${figureId}" in this report's body. Figure ids: ${ids}. Call get_report_editor.`,
    );
  }
  return fig;
}

export function liveBundleOrRefuse(
  ctx: EditingReportContext,
  figureId: string,
  verb: "read" | "edited",
): FigureBundle {
  const bundle = liveFigureOrRefuse(ctx, figureId).bundle;
  if (!bundle) {
    throw new AIToolFailure(
      `Figure "${figureId}" has no resolved data yet and can't be ${verb}.`,
    );
  }
  return bundle;
}

// A text edit the package refused. A body that broke a rule is a tool
// failure; a body identical to the current one is a no-decision result (no
// dialog was shown), which is panther's {skip}.
function refusedTextEdit(
  edit: Extract<ReportTextEdit, { ok: false }>,
): { skip: string } {
  if (edit.unchanged) return { skip: edit.error };
  throw new AIToolFailure(edit.error);
}

// The chat shows an approval tool's success label only for a {skip}: a
// report edit that would leave the body as it is, or a draft held unproposed.
const REPORT_UNCHANGED_LABEL: TranslatableString = {
  en: "Not proposed: the report would not change",
  fr: "Non proposé : le rapport ne changerait pas",
  pt: "Não proposto: o relatório não mudaria",
};

const DRAFT_HELD_LABEL: TranslatableString = {
  en: "Not proposed yet: the draft is held",
  fr: "Pas encore proposé : le brouillon est retenu",
  pt: "Ainda não proposto: o rascunho fica retido",
};

type NewFigure = { key: string; figure: AiFigureFromMetric };

async function resolveNewFigures(
  ctx: EditingReportContext,
  newFigures: NewFigure[] | undefined,
  metrics: MetricWithStatus[],
): Promise<Map<string, FigureBlock>> {
  const out = new Map<string, FigureBlock>();
  if (!newFigures || newFigures.length === 0) return out;
  const taken = new Set(Object.keys(ctx.getFigures()));
  for (const f of newFigures) {
    if (taken.has(f.key)) {
      throw new AIToolFailure(
        `Two new figures share the key "${f.key}", or it is already a figure id: give each new figure a key of its own.`,
      );
    }
    taken.add(f.key);
  }
  const blocks = await Promise.all(newFigures.map(async (f) => {
    try {
      return await resolveFigureFromMetric(ctx.getScope(), f.figure, metrics);
    } catch (e) {
      throw new AIToolFailure(
        `New figure "${f.key}": ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }));
  newFigures.forEach((f, i) => out.set(f.key, blocks[i]));
  return out;
}

// What each new figure will show, as the data excerpt get_metric_data gives
// for the same query: the prose around a figure has to quote ITS period and
// areas, not a number read earlier for another one.
const FIGURE_DATA_MAX_CHARS = 4000;

async function describeNewFigureData(
  env: ClientAIToolEnv,
  metrics: MetricWithStatus[],
  figures: Map<string, FigureBlock>,
): Promise<string> {
  const parts = await Promise.all(
    [...figures].map(async ([key, block]) => {
      const bundle = block.bundle;
      if (!bundle) return `### figure:${key}\n(no data)`;
      let data: string;
      try {
        data = await getDataFromConfig(
          env,
          bundle.metricId,
          metrics,
          bundle.config,
        );
      } catch (e) {
        data = `(could not read its data: ${
          e instanceof Error ? e.message : String(e)
        })`;
      }
      if (data.length > FIGURE_DATA_MAX_CHARS) {
        data = `${
          data.slice(0, FIGURE_DATA_MAX_CHARS)
        }\n… (cut; call get_metric_data for the rest)`;
      }
      const caption = bundle.config.t.caption;
      return `### figure:${key}${
        caption ? ` ("${caption}")` : ""
      } · ${bundle.config.d.type}\n${data}`;
    }),
  );
  return `## What each new figure shows

Every number the prose quotes about a figure must match it: the same period, the same areas, the same values. Where the text was written from other data, rewrite it from these.

${parts.join("\n\n")}`;
}

// The problems the page map finds in a body about to be proposed, or
// undefined when its pages are set. A model told to check its draft with
// get_report_pages still proposed ones with a near-empty page before a
// template and a one-paragraph last page (2026-10-28), so a whole-report
// rewrite is laid out once more at the proposal itself. A layout that cannot
// run is reported, never read as clean pages: swallowing one proposed a draft
// with two half-empty pages unchecked (2026-11-05).
async function pageProblemsOf(
  ctx: EditingReportContext,
  reportId: string,
  draft: { body: string; figures: Record<string, FigureBlock> },
): Promise<string | undefined | { layoutFailed: string }> {
  const res = await getReportDetailFromCacheOrFetch(reportId);
  if (!res.success) return { layoutFailed: res.err };
  let pages: string;
  try {
    pages = await describeReportPages(
      {
        ...res.data,
        body: draft.body,
        figures: { ...ctx.getFigures(), ...draft.figures },
        images: ctx.getImages(),
      },
      (imgFile) => resolveLogoUrl(imgFile),
    );
  } catch (e) {
    return { layoutFailed: e instanceof Error ? e.message : String(e) };
  }
  const at = pages.indexOf("\nProblems:\n");
  return at < 0 ? undefined : pages.slice(at + 1);
}

// A whole-report draft rewrite_report laid out and could not propose yet: its
// pages had problems, it broke a rule, or its new figures' data still had to
// be read against the prose. Fixing one by resending the body cost a full
// report of output per round (a 20-page report written 3 to 6 times, 20+
// minutes, 2026-11-04), so the draft is held here and edit_report_draft fixes
// it with small replacements. Held per report until a proposal of it is
// accepted, or a new rewrite_report replaces it.
type HeldReportDraft = {
  // As the model wrote it: new figures embedded by their keys, so an edit
  // quotes the text the model has.
  body: string;
  added: Map<string, FigureBlock>;
  allowLiteralColors?: boolean;
  plain?: boolean;
  // Page-problem refusals of this draft so far (rewrite_report's own
  // included): see DRAFT_PAGE_REFUSALS.
  pageRefusals: number;
};

// A draft refused this many times for its pages is proposed with what is
// left, for the user to judge, rather than refused again: a model that could
// not fix a page kept trying until the turn hit its round cap and ended
// with nothing proposed.
const DRAFT_PAGE_REFUSALS = 3;

const heldReportDrafts = new Map<string, HeldReportDraft>();

const HELD_DRAFT_HINT =
  "The draft is held: fix it with edit_report_draft (each edit an exact oldText from the draft as you wrote it, and its newText). Do not resend the whole body with rewrite_report.";

// One cheap index line per figure for get_report_editor: pure, no fetch. The
// metric is the one the figure reads as, so the model never takes a retired
// id for a live one.
function formatFigureIndexLine(
  id: string,
  fig: FigureBlock,
  metrics: readonly MetricWithStatus[],
): string {
  if (!fig.bundle) return `- figure:${id} — (no data)`;
  const r = resolveFigureMetric(metrics, fig.bundle);
  const metricPart = r.kind === "current"
    ? r.metric.id
    : r.kind === "succeeded"
    ? `${fig.bundle.metricId} (retired; reads as ${r.metric.id})`
    : `${fig.bundle.metricId} (not in this package)`;
  const cfg = r.kind === "absent" ? fig.bundle.config : r.config;
  const parts = [`figure:${id}`, metricPart, cfg.d.type];
  if (cfg.t.caption) parts.push(`"${cfg.t.caption}"`);
  const replicateBy = getReplicateByProp(cfg);
  if (replicateBy) {
    parts.push(
      `replicant ${replicateBy}=${cfg.d.selectedReplicantValue ?? "(unset)"}`,
    );
  }
  return `- ${parts.join(" · ")}`;
}

export function getClientToolsForReportEditor(
  env: ClientAIToolEnv,
  metrics: MetricWithStatus[],
) {
  // Hold the draft, check it as rewrite_report always has (the body's rules,
  // every new figure embedded, its pages laid out), and propose it only once
  // it passes. `firstLook` is rewrite_report's own call: a draft that adds
  // figures is held once with what each figure shows, so the prose is read
  // against the data before the user sees it.
  async function proposeHeldDraft(
    view: { context: EditingReportContext; params: { reportId: string } },
    draft: HeldReportDraft,
    opts: { acceptPageProblems?: boolean; firstLook: boolean },
  ) {
    const ctx = view.context;
    const reportId = view.params.reportId;
    heldReportDrafts.set(reportId, draft);
    const own = embedIdsOf(ctx);
    // A backbone that uses no blocks writes plain reports: the "no blocks"
    // refusal is not its business.
    const edit = rewriteReportBody(ctx.getBody(), {
      body: draft.body,
      allowLiteralColors: draft.allowLiteralColors,
      plain: draft.plain ||
        reportBackboneAllowsPlain(ctx.getBackbone()?.backbone),
    }, {
      figures: [...own.figures, ...draft.added.keys()],
      images: own.images,
    });
    if (!edit.ok) {
      if (edit.unchanged) return { skip: edit.error };
      throw new AIToolFailure(`${edit.error}\n\n${HELD_DRAFT_HINT}`);
    }
    let newBody = edit.newBody;
    const addFigures: Record<string, FigureBlock> = {};
    for (const [key, block] of draft.added) {
      const id = crypto.randomUUID();
      const swapped = replaceReportEmbedTokens(
        newBody,
        "figure",
        key,
        (ref) => rewriteReportEmbedToken(ref, { id }),
      );
      if (swapped.count === 0) {
        throw new AIToolFailure(
          `New figure "${key}" is never embedded: add ![caption](figure:${key}) where it belongs, or drop it from newFigures.\n\n${HELD_DRAFT_HINT}`,
        );
      }
      newBody = swapped.body;
      addFigures[id] = block;
    }
    const laidOut = await pageProblemsOf(ctx, reportId, {
      body: newBody,
      figures: addFigures,
    });
    // A layout that did not run leaves the pages unknown: the draft stays
    // held, and only acceptPageProblems (given after this refusal) lets it
    // through unchecked.
    if (typeof laidOut === "object" && opts.acceptPageProblems !== true) {
      throw new AIToolFailure(
        `Not proposed: the draft's pages could not be laid out (${laidOut.layoutFailed}), so they are unchecked. The draft is held: call edit_report_draft with no edits to lay it out again. Only if it fails again, call it with acceptPageProblems: true and tell the user the pages were not checked.`,
      );
    }
    const problems = typeof laidOut === "object" ? undefined : laidOut;
    if (opts.firstLook && draft.added.size > 0) {
      const data = await describeNewFigureData(env, metrics, draft.added);
      return {
        skip: [
          "Not proposed yet: the draft is held while you check it against its figures.",
          problems === undefined
            ? "Its pages are set."
            : `Its pages have problems the reader would see.\n\n${problems}`,
          data,
          `Rewrite every sentence whose numbers disagree with its figure's data (same period, same areas, same values)${
            problems === undefined ? "" : " and fix every page problem"
          } with edit_report_draft: each edit an exact oldText from the draft as you wrote it, and its newText. Call edit_report_draft with no edits to propose the draft as it stands. Do not resend the whole body.`,
        ].join("\n\n"),
      };
    }
    // A page more than half empty is a hole the waiver does not cover:
    // models waived one rather than move prose (2026-11-02).
    const holes = (problems ?? "").split("\n").filter((l) =>
      l.includes(FASTR_PAGE_MUST_FIX)
    );
    const waived = opts.acceptPageProblems === true && holes.length === 0;
    const exhausted = draft.pageRefusals >= DRAFT_PAGE_REFUSALS;
    if (problems !== undefined && !waived && !exhausted) {
      draft.pageRefusals++;
      const left = DRAFT_PAGE_REFUSALS - draft.pageRefusals;
      const budget = left === 0
        ? "This was the last refusal: the next edit_report_draft proposes the draft with whatever problems remain, and you must tell the user which."
        : `${left} more refusal${
          left === 1 ? "" : "s"
        } before the draft is proposed with whatever problems remain.`;
      throw new AIToolFailure(
        opts.acceptPageProblems === true
          ? `Not proposed: acceptPageProblems does not waive a page left more than half empty.\n\n${
            holes.join("\n")
          }\n\n${HELD_DRAFT_HINT} ${budget}`
          : `Not proposed: the draft's pages have problems the reader would see.\n\n${problems}\n\n${HELD_DRAFT_HINT} Only if one cannot be fixed, call edit_report_draft with acceptPageProblems: true and tell the user which remain; a problem marked ${FASTR_PAGE_MUST_FIX} cannot be waived. ${budget}`,
      );
    }
    const unresolved = problems !== undefined && !waived;
    const prep = ctx.proposeEdit({
      newBody,
      addFigures: draft.added.size > 0 ? addFigures : undefined,
      summary: unresolved
        ? `${edit.summary} (some pages still have layout problems)`
        : edit.summary,
    });
    if ("skip" in prep) return prep;
    return {
      preview: prep.preview,
      customProposalUI: prep.customProposalUI,
      stillValid: prep.stillValid,
      commit: async () => {
        const { skipped } = await prep.commit();
        if (heldReportDrafts.get(reportId) === draft) {
          heldReportDrafts.delete(reportId);
        }
        copilotViewController.markAIEdit(`product:${reportId}`);
        return (
          "The user ACCEPTED the rewrite; it is now applied to the report." +
          reportSkippedNote(skipped) +
          (unresolved
            ? `\n\nIt was proposed after ${DRAFT_PAGE_REFUSALS} page refusals, with these problems left: tell the user which pages are affected and offer to fix them.\n\n${problems}`
            : "")
        );
      },
    };
  }

  return [
    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("get_report_editor"),
      handler: async (_input, view) => {
        const ctx = view.context;
        const figs = liveFiguresOf(ctx);
        const figureIds = Object.keys(figs);
        const figureSection = figureIds.length
          ? [
            `## Figures (call get_report_figure for full config; update_report_figure to edit in place):`,
            ...figureIds.map((id) =>
              formatFigureIndexLine(id, figs[id], metrics)
            ),
          ]
          : [`## Figures: none`];
        return readReportText(ctx.getBody(), {
          title: ctx.getLabel(),
          figureLines: figureSection,
          // The ids a PROPOSED body may embed, which is the full registry,
          // not the index above: `figureLines` is what the model reads.
          embeds: embedIdsOf(ctx),
          selection: ctx.getSelection(),
        }).text;
      },
      inProgressLabel: t3({
        en: "Getting the report editor...",
        fr: "Récupération de l'éditeur de rapport...",
        pt: "A obter o editor de relatório...",
      }),
      successMessage: t3({
        en: "Retrieved the report editor",
        fr: "Éditeur de rapport récupéré",
        pt: "Editor de relatório obtido",
      }),
    }),

    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("get_report_figure"),
      handler: async (input, view) => {
        const ctx = view.context;
        const bundle = liveBundleOrRefuse(ctx, input.figureId, "read");
        const { lines, metric, config } = readFigureMetricForAI(
          metrics,
          bundle,
        );
        const text = await formatFigureConfigForAI(
          env,
          metric,
          config,
          bundle.dateRange,
        );
        return [...lines, text].join("\n");
      },
      inProgressLabel: t3({
        en: "Getting a visualization of the report...",
        fr: "Récupération d'une visualisation du rapport...",
        pt: "A obter uma visualização do relatório...",
      }),
      successMessage: t3({
        en: "Retrieved a visualization of the report",
        fr: "Visualisation du rapport récupérée",
        pt: "Visualização do relatório obtida",
      }),
    }),

    createGetReportFigureImagesTool(),

    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("update_report_figure"),
      handler: async (input, view) => {
        const ctx = view.context;
        const bundle = liveBundleOrRefuse(ctx, input.figureId, "edited");
        // An empty patch would re-resolve the figure unchanged and falsely
        // report success.
        if (Object.keys(input.patch).length === 0) {
          throw new AIToolFailure(
            "No editable fields were provided. update_report_figure changes a " +
              "figure's config (replicant, filters, disaggregation, period, " +
              "captions); it cannot change the metric/indicator or chart type. To " +
              "show a different indicator or chart, use replace_figure.",
          );
        }
        const { lines: moved, metric, config: storedConfig } =
          editFigureMetricForAI(metrics, bundle);

        // Pre-flight for a stored defect this tool cannot repair (the figure
        // patch schema carries no timeseriesGrouping): see update_figure.
        if (
          storedConfig.d.type === "timeseries" &&
          !storedConfig.d.timeseriesGrouping
        ) {
          throw new AIToolFailure(
            "This figure's stored config is a timeseries with no period grouping, which cannot render. It cannot be repaired here — the figure must be recreated via replace_figure. No changes were applied.",
          );
        }

        // Hoisted conditional fetch: period bounds (open-ended periodFilter)
        // + possible-values map (pre-write collision check): see update_figure.
        const pf = input.patch.periodFilter;
        const needsBounds = typeof pf === "object" && pf !== null &&
          (pf.min == null) !== (pf.max == null);
        const needsPossibleValues = input.patch.disaggregateBy !== undefined ||
          input.patch.valuesDisDisplayOpt !== undefined;
        let dataBounds: PeriodBounds | undefined;
        let disaggregationPossibleValues:
          | ResultsValueInfoForPresentationObject[
            "disaggregationPossibleValues"
          ]
          | undefined;
        if (needsBounds || needsPossibleValues) {
          const infoRes =
            await getResultsValueInfoForPresentationObjectFromCacheOrFetch(
              view.context.getScope(),
              metric.id,
            );
          if (infoRes.success) {
            dataBounds = infoRes.data.periodBounds;
            disaggregationPossibleValues =
              infoRes.data.disaggregationPossibleValues;
          }
          if (needsBounds && !dataBounds) {
            throw new AIToolFailure(
              "Cannot set an open-ended periodFilter: the metric's data period range is unavailable. Provide both min and max.",
            );
          }
        }

        // Validate UP FRONT (a throw must mean "nothing changed"); commit once valid.
        const newConfig = applyFigureConfigPatch(
          storedConfig,
          input.patch,
          metric,
          dataBounds,
        );
        validateFigureConfigEdit(
          storedConfig,
          newConfig,
          input.patch,
          metric,
          {
            disaggregationPossibleValues,
          },
        );

        const filters = newConfig.d.filterBy.length > 0
          ? newConfig.d.filterBy
          : undefined;
        const periodFilter = newConfig.d.periodFilter &&
            periodFilterHasBounds(newConfig.d.periodFilter)
          ? {
            min: newConfig.d.periodFilter.min,
            max: newConfig.d.periodFilter.max,
          }
          : undefined;
        await validateMetricInputs(env, metric.id, filters, periodFilter);

        const report = [
          ...moved,
          ...describeFigureConfigPatchEffect(
            storedConfig,
            input.patch,
            metric,
            dataBounds,
          ),
        ];

        const newBundle = await resolveBundleFromMetricAndConfig(
          view.context.getScope(),
          metric,
          newConfig,
          bundle.localization,
        );
        assertNoSlotCollision(
          newConfig,
          metric,
          newBundle.dateRange,
          newBundle.items,
        );

        // Formatted before the write, and as get_report_figure prints it: a
        // throw once the figure is saved would report a saved change as failed.
        const resulting = await formatFigureConfigForAI(
          env,
          metric,
          newConfig,
          newBundle.dateRange,
        );

        const saved = await ctx.applyFigureUpdate(input.figureId, {
          type: "figure",
          bundle: newBundle,
        });
        if (!saved) {
          throw new AIToolFailure(
            `Figure ${input.figureId} was updated in the live preview but SAVING TO ` +
              `THE SERVER FAILED; the change may be lost on reload. Tell the user to ` +
              `check their connection and try again.`,
          );
        }
        copilotViewController.markAIEdit(`product:${view.params.reportId}`);
        return `Updated figure ${input.figureId}.\n${
          report.map((l) => `- ${l}`).join("\n")
        }\nThe preview is updated and saved.\nFigure ${input.figureId}:\n${resulting}`;
      },
      inProgressLabel: t3({
        en: "Updating a visualization of the report...",
        fr: "Mise à jour d'une visualisation du rapport...",
        pt: "A atualizar uma visualização do relatório...",
      }),
      successMessage: t3({
        en: "Updated a visualization of the report",
        fr: "Visualisation du rapport mise à jour",
        pt: "Visualização do relatório atualizada",
      }),
    }),

    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("get_report_pages"),
      inProgressLabel: t3({
        en: "Getting the report's pages...",
        fr: "Récupération des pages du rapport...",
        pt: "A obter as páginas do relatório...",
      }),
      successMessage: t3({
        en: "Retrieved the report's pages",
        fr: "Pages du rapport récupérées",
        pt: "Páginas do relatório obtidas",
      }),
      handler: async (input, view) => {
        // The stored detail carries the config (the theme drives the page
        // metrics); the live editor state carries what the user can see.
        const res = await getReportDetailFromCacheOrFetch(view.params.reportId);
        if (!res.success) throw new AIToolFailure(res.err);
        const ctx = view.context;
        const theme: FastrReportTheme = input.theme ??
          getFastrReportTheme(res.data.config);
        if (input.markdown === undefined && input.newFigures?.length) {
          throw new AIToolFailure(
            "newFigures goes with markdown: pass the draft that embeds them.",
          );
        }
        if (
          (input.sectionHeading === undefined) !== (input.newBody === undefined)
        ) {
          throw new AIToolFailure(
            "sectionHeading and newBody go together: the section and its new text.",
          );
        }
        if (
          input.sectionHeading !== undefined && input.markdown !== undefined
        ) {
          throw new AIToolFailure(
            "Pass either markdown (a whole body) or sectionHeading with newBody (one section swapped in), not both.",
          );
        }
        const added = await resolveNewFigures(ctx, input.newFigures, metrics);
        // A draft keeps the report's own figures and images: the ones it
        // still embeds print at their real size, as they will. Read against
        // the full registry, since a draft may re-embed a still-registered id.
        let body: string;
        if (input.markdown !== undefined) {
          body = collapseFastrBlankRuns(input.markdown);
        } else if (
          input.sectionHeading !== undefined && input.newBody !== undefined
        ) {
          // The body rewrite_section would propose, with its checks.
          const edit = rewriteReportSection(ctx.getBody(), {
            sectionHeading: input.sectionHeading,
            newBody: input.newBody,
            occurrenceIndex: input.occurrenceIndex,
            allowLiteralColors: true,
          }, embedIdsOf(ctx));
          if (!edit.ok && !edit.unchanged) throw new AIToolFailure(edit.error);
          body = edit.ok ? edit.newBody : ctx.getBody();
        } else {
          body = ctx.getBody();
        }
        const detail = {
          ...res.data,
          body,
          figures: reportLiveFigures(body, {
            ...ctx.getFigures(),
            ...Object.fromEntries(added),
          }),
          images: ctx.getImages(),
          config: { ...res.data.config, fastrTheme: theme },
        };
        const pages = await describeReportPages(
          detail,
          (imgFile) => resolveLogoUrl(imgFile),
        );
        if (added.size === 0) return pages;
        return `${pages}\n\n${await describeNewFigureData(
          env,
          metrics,
          added,
        )}`;
      },
    }),

    // The page templates' slots and examples, on demand, so the format
    // guide carries one line per layout rather than every layout's spec.
    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("get_page_template"),
      inProgressLabel: t3({
        en: "Getting the page templates...",
        fr: "Récupération des modèles de page...",
        pt: "A obter os modelos de página...",
      }),
      successMessage: t3({
        en: "Retrieved the page templates",
        fr: "Modèles de page récupérés",
        pt: "Modelos de página obtidos",
      }),
      handler: (input) =>
        Promise.resolve(
          fastrPageTemplatesLookup([
            ...(input.layouts ?? []),
            ...(input.layout === undefined ? [] : [input.layout]),
          ]),
        ),
    }),

    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("rewrite_report"),
      approval: {
        propose: async (input, view) => {
          const added = await resolveNewFigures(
            view.context,
            input.newFigures,
            metrics,
          );
          return proposeHeldDraft(view, {
            body: input.body,
            added,
            allowLiteralColors: input.allowLiteralColors,
            plain: input.plain,
            pageRefusals: 0,
          }, {
            acceptPageProblems: input.acceptPageProblems,
            firstLook: true,
          });
        },
      },
      inProgressLabel: t3({
        en: "Proposing a rewrite of the report...",
        fr: "Proposition d'une réécriture du rapport...",
        pt: "A propor uma reescrita do relatório...",
      }),
      successMessage: t3(DRAFT_HELD_LABEL),
    }),

    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("edit_report_draft"),
      approval: {
        propose: (input, view) => {
          const held = heldReportDrafts.get(view.params.reportId);
          if (!held) {
            throw new AIToolFailure(
              "No draft is held for this report: write the whole draft with rewrite_report first.",
            );
          }
          const applied = applyReportDraftEdits(held.body, input.edits ?? []);
          if (!applied.ok) throw new AIToolFailure(applied.error);
          const body = applied.body;
          const embedded = new Set(
            findReportEmbeds(body).filter((r) => r.kind === "figure").map((
              r,
            ) => r.id),
          );
          const added = new Map(
            [...held.added].filter(([key]) => embedded.has(key)),
          );
          return proposeHeldDraft(view, { ...held, body, added }, {
            acceptPageProblems: input.acceptPageProblems,
            firstLook: false,
          });
        },
      },
      inProgressLabel: t3({
        en: "Proposing the edited draft...",
        fr: "Proposition du brouillon modifié...",
        pt: "A propor o rascunho editado...",
      }),
      successMessage: t3(DRAFT_HELD_LABEL),
    }),

    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("rewrite_section"),
      approval: {
        propose: async (input, view) => {
          const ctx = view.context;
          const edit = rewriteReportSection(
            ctx.getBody(),
            input,
            embedIdsOf(ctx),
          );
          if (!edit.ok) return refusedTextEdit(edit);
          const prep = ctx.proposeEdit({
            newBody: edit.newBody,
            summary: edit.summary,
          });
          if ("skip" in prep) return prep;
          return {
            preview: prep.preview,
            customProposalUI: prep.customProposalUI,
            stillValid: prep.stillValid,
            commit: async () => {
              const { skipped } = await prep.commit();
              copilotViewController.markAIEdit(
                `product:${view.params.reportId}`,
              );
              return (
                `The user ACCEPTED the rewrite of section "${input.sectionHeading}"; it is now applied.` +
                reportSkippedNote(skipped)
              );
            },
          };
        },
      },
      inProgressLabel: t3({
        en: "Proposing a rewrite of a section...",
        fr: "Proposition d'une réécriture de section...",
        pt: "A propor uma reescrita de secção...",
      }),
      successMessage: t3(REPORT_UNCHANGED_LABEL),
    }),

    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("replace_text"),
      approval: {
        propose: async (input, view) => {
          const ctx = view.context;
          const edit = replaceReportText(
            ctx.getBody(),
            input,
            embedIdsOf(ctx),
          );
          if (!edit.ok) return refusedTextEdit(edit);
          const prep = ctx.proposeEdit({
            newBody: edit.newBody,
            summary: edit.summary,
          });
          if ("skip" in prep) return prep;
          return {
            preview: prep.preview,
            customProposalUI: prep.customProposalUI,
            stillValid: prep.stillValid,
            commit: async () => {
              const { skipped } = await prep.commit();
              copilotViewController.markAIEdit(
                `product:${view.params.reportId}`,
              );
              return (
                "The user ACCEPTED the edit; it is now applied to the report." +
                reportSkippedNote(skipped)
              );
            },
          };
        },
      },
      inProgressLabel: t3({
        en: "Proposing a text edit...",
        fr: "Proposition d'une modification du texte...",
        pt: "A propor uma alteração do texto...",
      }),
      successMessage: t3(REPORT_UNCHANGED_LABEL),
    }),

    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("insert_figure"),
      approval: {
        propose: async (input, view) => {
          const ctx = view.context;
          const figureBlock = await resolveFigureFromMetric(
            view.context.getScope(),
            input.figure,
            metrics,
          );
          const id = crypto.randomUUID();
          const caption = (input.caption ?? "").replace(/\s+/g, " ").trim();
          const token = buildReportEmbedToken("figure", id, caption);
          const result = insertAfterReportHeading(
            ctx.getBody(),
            input.afterHeading,
            token,
          );
          if ("error" in result) {
            throw new AIToolFailure(result.error);
          }
          const prep = ctx.proposeEdit({
            newBody: result.newBody,
            addFigures: { [id]: figureBlock },
            summary: caption ? `Insert figure: ${caption}` : "Insert figure",
          });
          if ("skip" in prep) return prep;
          return {
            preview: prep.preview,
            customProposalUI: prep.customProposalUI,
            stillValid: prep.stillValid,
            commit: async () => {
              const { skipped } = await prep.commit();
              copilotViewController.markAIEdit(
                `product:${view.params.reportId}`,
              );
              return (
                `The user ACCEPTED the figure insert (id ${id}); it is now in the report.` +
                reportSkippedNote(skipped) +
                (skipped.length
                  ? " If the figure token was in a skipped change, the figure is unreferenced and will be pruned."
                  : "") +
                `\n\n${await describeNewFigureData(
                  env,
                  metrics,
                  new Map([[id, figureBlock]]),
                )}`
              );
            },
          };
        },
      },
      inProgressLabel: t3({
        en: "Proposing a new visualization...",
        fr: "Proposition d'une nouvelle visualisation...",
        pt: "A propor uma nova visualização...",
      }),
      successMessage: t3(REPORT_UNCHANGED_LABEL),
    }),

    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("replace_figure"),
      approval: {
        propose: async (input, view) => {
          const ctx = view.context;
          const replaced = liveFigureOrRefuse(ctx, input.figureId);
          const chartTitle = input.figure.chartTitle ??
            replaced.bundle?.config.t.caption;
          if (chartTitle === undefined) {
            throw new AIToolFailure(
              `Figure "${input.figureId}" has no chart to take a title from: give figure.chartTitle.`,
            );
          }
          // Liveness is what the DOCUMENT resolves (reportLiveFigures), while
          // this rewrite is the canonical token's, so a figure embedded as a
          // titled, reference or angle-bracket destination is live and not
          // rewritable here. Without this the body comes back unchanged and the
          // model hears only "IDENTICAL to the current body".
          const refuseUnrewritable = (): never => {
            throw new AIToolFailure(
              `Figure "${input.figureId}" is embedded in a form this tool cannot rewrite (not the plain \`![caption](figure:<id>)\` token). Rewrite that embed as \`${
                buildReportEmbedToken("figure", input.figureId, "<caption>")
              }\` with replace_text, then call replace_figure again. update_report_figure works on the embed as it stands, but only for this figure's config (replicant, filters, disaggregation, period, captions): it cannot change the metric or chart type.`,
            );
          };
          const rewritable = (body: string) =>
            findReportEmbeds(body).some(
              (r) => r.kind === "figure" && r.id === input.figureId,
            );
          // Refused before the figure is resolved, which costs a package query:
          // whether the body can be rewritten depends only on the body and the
          // id. This read is not the proposal's base, so it may precede the
          // await.
          if (!rewritable(ctx.getBody())) refuseUnrewritable();
          const figureBlock = await resolveFigureFromMetric(
            view.context.getScope(),
            { ...input.figure, chartTitle },
            metrics,
          );
          const newId = crypto.randomUUID();
          const overrideCaption = input.caption !== undefined
            ? input.caption.replace(/\s+/g, " ").trim()
            : undefined;
          // Swap every token for this figure id (preserving each caption unless
          // overridden) to a fresh id pointing at the new figure block. A
          // caption override
          // therefore rewrites EVERY embed of this id, which is destructive
          // when the same figure is embedded twice with different captions —
          // the tool input has no occurrence selector, so the count is surfaced
          // in the summary and the user sees the full rewrite in the
          // accept/reject diff.
          //
          // The body is read HERE, after the await: `proposeEdit`'s base is
          // `body()` at that call, so an await between this read and it makes
          // the proposal's diff, and its rebase on accept, revert whatever was
          // typed meanwhile.
          const swapped = replaceReportEmbedTokens(
            ctx.getBody(),
            "figure",
            input.figureId,
            (ref) =>
              rewriteReportEmbedToken(
                ref,
                { id: newId, caption: overrideCaption },
              ),
          );
          // A token that vanished under the await: without this it falls into
          // proposeEdit's "IDENTICAL to the current body" skip.
          if (swapped.count === 0) refuseUnrewritable();
          const embedCount = swapped.count;
          const newBody = swapped.body;
          validateReportBodyLength(newBody);
          validateReportTokensResolve(
            newBody,
            { ...ctx.getFigures(), [newId]: figureBlock },
            ctx.getImages(),
          );
          const prep = ctx.proposeEdit({
            newBody,
            addFigures: { [newId]: figureBlock },
            summary: overrideCaption !== undefined && embedCount > 1
              ? `Replace figure (new caption applied to all ${embedCount} embeds)`
              : "Replace figure",
          });
          if ("skip" in prep) return prep;
          return {
            preview: prep.preview,
            customProposalUI: prep.customProposalUI,
            stillValid: prep.stillValid,
            commit: async () => {
              const { skipped } = await prep.commit();
              copilotViewController.markAIEdit(
                `product:${view.params.reportId}`,
              );
              return (
                `The user ACCEPTED the figure replacement (new id ${newId}); it is now in the report.` +
                reportSkippedNote(skipped) +
                (skipped.length
                  ? " If the token swap was in a skipped change, the old figure may still be referenced and the new one unreferenced (it will be pruned)."
                  : "") +
                `\n\n${await describeNewFigureData(
                  env,
                  metrics,
                  new Map([[newId, figureBlock]]),
                )}`
              );
            },
          };
        },
      },
      inProgressLabel: t3({
        en: "Proposing a replacement visualization...",
        fr: "Proposition d'une visualisation de remplacement...",
        pt: "A propor uma visualização de substituição...",
      }),
      successMessage: t3(REPORT_UNCHANGED_LABEL),
    }),
  ];
}
