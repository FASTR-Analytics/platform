import {
  readReportText,
  replaceReportText,
  type ReportEmbedIds,
  reportSkippedNote,
  type ReportTextEdit,
  rewriteReportBody,
  rewriteReportSection,
} from "report-forge/ai";
import { AIToolFailure, createAITool } from "panther";
import { z } from "zod";
import {
  AiFigureConfigPatchSchema,
  type AiFigureFromMetric,
  AiFigureFromMetricSchema,
  buildReportEmbedToken,
  collapseFastrBlankRuns,
  COPILOT_TOOL_VIEWS,
  FASTR_PAGE_TEMPLATE_TOOL_DESCRIPTION,
  fastrPageTemplateLookup,
  type FastrReportTheme,
  fastrThemeIds,
  type FigureBlock,
  findReportEmbeds,
  getDataFromConfig,
  getFastrReportTheme,
  getReplicateByProp,
  insertAfterReportHeading,
  type MetricWithStatus,
  type PeriodBounds,
  periodFilterHasBounds,
  replaceReportEmbedTokens,
  resolveFigureMetric,
  type ResultsValueInfoForPresentationObject,
  rewriteReportEmbedToken,
} from "lib";
import { FASTR_MD_SYNTAX_DOC } from "lib";
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
function embedIdsOf(ctx: EditingReportContext): ReportEmbedIds {
  return {
    figures: Object.keys(ctx.getFigures()),
    images: Object.keys(ctx.getImages()),
  };
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

// Figures a draft adds: each a metric plus a preset, named by a short key the
// body embeds as `![caption](figure:<key>)`. rewrite_report swaps each key for
// a fresh id, so a whole report and its figures are one diff, and the draft
// get_report_pages lays out has the figures it will print with.
const NEW_FIGURE_KEY_RE = /^[a-z][a-z0-9-]{0,39}$/;

const newFiguresSchema = z.array(z.object({
  key: z.string().regex(NEW_FIGURE_KEY_RE).describe(
    "A short lowercase name for this figure, e.g. trend or by-region. The body embeds it as ![caption](figure:<key>).",
  ),
  figure: AiFigureFromMetricSchema,
})).optional();

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
// rewrite is laid out once more at the proposal itself. A layout that
// cannot run does not hold the proposal up.
async function pageProblemsOf(
  ctx: EditingReportContext,
  reportId: string,
  draft: { body: string; figures: Record<string, FigureBlock> },
): Promise<string | undefined> {
  const res = await getReportDetailFromCacheOrFetch(reportId);
  if (!res.success) return undefined;
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
  } catch {
    return undefined;
  }
  const at = pages.indexOf("\nProblems:\n");
  return at < 0 ? undefined : pages.slice(at + 1);
}

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
  return [
    createAITool({
      viewRegistry: copilotViews,
      name: "get_report_editor",
      description:
        "Get the report's current body (FASTR Markdown), a headings index (each heading's line and the exact section range rewrite_section would replace), a one-line index of each embedded figure (id, metric, type, caption, active replicant), and the embedded image ids (live editor state, including unsaved changes). ALWAYS call this first before proposing edits. For a figure's full config (available replicant values, slots, filters) call get_report_figure.",
      inputSchema: z.object({}),
      availableIn: COPILOT_TOOL_VIEWS.get_report_editor,
      kind: "read",
      handler: async (_input, view) => {
        const ctx = view.context;
        const figs = ctx.getFigures();
        const figureIds = Object.keys(figs);
        const imgIds = Object.keys(ctx.getImages());
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
          embeds: { figures: figureIds, images: imgIds },
          selection: ctx.getSelection(),
        }).text;
      },
      inProgressLabel: "Reading report editor...",
      completionMessage: "Read report editor",
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "get_report_figure",
      description:
        "Get the FULL configuration of one report figure: its metric, type, " +
        "disaggregations, filters, the active replicant and the AVAILABLE " +
        "replicant values, display slots, captions, and the metric's available " +
        "dimensions. Call this before update_report_figure to see what a figure " +
        "shows and which replicant/filter values are valid. figureId is the id " +
        "after 'figure:' in get_report_editor.",
      inputSchema: z.object({
        figureId: z
          .string()
          .describe(
            "Figure id from get_report_editor (the part after 'figure:').",
          ),
      }),
      availableIn: COPILOT_TOOL_VIEWS.get_report_figure,
      kind: "read",
      handler: async (input, view) => {
        const ctx = view.context;
        const fig = ctx.getFigures()[input.figureId];
        if (!fig) {
          const ids = Object.keys(ctx.getFigures()).join(", ") || "(none)";
          throw new AIToolFailure(
            `No figure with id "${input.figureId}". Figure ids: ${ids}.`,
          );
        }
        if (!fig.bundle) {
          throw new AIToolFailure(
            `Figure "${input.figureId}" has no resolved data yet and can't be read.`,
          );
        }
        const bundle = fig.bundle;
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
      inProgressLabel: "Reading figure...",
      completionMessage: "Read figure",
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "update_report_figure",
      description:
        "Edit an existing report FIGURE's CONFIGURATION in place — the tool for " +
        "changing the replicant, filters, disaggregation, period, or captions of a " +
        "figure already embedded in the report, regardless of how it was created. " +
        "Provide the figureId (from get_report_editor) and only the fields to " +
        "change; everything else is preserved and the data is re-queried " +
        "automatically. To CHANGE A REPLICANT, use this — it validates the value " +
        "against the available options and errors clearly. It CANNOT change the " +
        "figure's metric/indicator or chart TYPE — to show a different indicator " +
        "or a different chart, use replace_figure instead. The change is applied " +
        "to the live preview and saved immediately; the figure's body token is " +
        "unchanged (no accept/reject diff).",
      inputSchema: z.object({
        figureId: z
          .string()
          .describe(
            "Figure id from get_report_editor (the part after 'figure:').",
          ),
        patch: AiFigureConfigPatchSchema,
      }),
      availableIn: COPILOT_TOOL_VIEWS.update_report_figure,
      kind: "write",
      handler: async (input, view) => {
        const ctx = view.context;
        const fig = ctx.getFigures()[input.figureId];
        if (!fig) {
          const ids = Object.keys(ctx.getFigures()).join(", ") || "(none)";
          throw new AIToolFailure(
            `No figure with id "${input.figureId}". Figure ids: ${ids}.`,
          );
        }
        if (!fig.bundle) {
          throw new AIToolFailure(
            `Figure "${input.figureId}" has no resolved data yet and can't be edited.`,
          );
        }
        if (
          !findReportEmbeds(ctx.getBody()).some(
            (r) => r.kind === "figure" && r.id === input.figureId,
          )
        ) {
          throw new AIToolFailure(
            `Figure "${input.figureId}" is registered but its token isn't in the report body. Call get_report_editor.`,
          );
        }
        // metricId/type are not in the patch schema (silently stripped), so an
        // all-unsupported patch arrives empty: reject it instead of re-resolving
        // the figure unchanged and falsely reporting success.
        if (Object.keys(input.patch).length === 0) {
          throw new AIToolFailure(
            "No editable fields were provided. update_report_figure changes a " +
              "figure's config (replicant, filters, disaggregation, period, " +
              "captions); it cannot change the metric/indicator or chart type. To " +
              "show a different indicator or chart, use replace_figure.",
          );
        }
        const bundle = fig.bundle;
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
        );
        assertNoSlotCollision(
          newConfig,
          metric,
          newBundle.dateRange,
          newBundle.items,
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
        }\nThe preview is updated and saved.`;
      },
      inProgressLabel: "Updating figure...",
      completionMessage: "Updated figure",
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "get_report_pages",
      description:
        `Lay this FASTR Markdown report out as its printed pages (A4 unless the report says otherwise; the pages the PDF and the editor show) and return the page map: every page's fill, the blocks that landed on it with each one's share of the page, and the problems: a page left short (because its next block moved whole to the following page, or because a page break or a page template ends it early), a page holding only the spill of the section before it, a page template whose content stops part way down its page or holds more than it shows, two figures back to back, and a last page that is a stub. Call it with no arguments for the report as it stands (live editor state), or pass \`markdown\` to check a draft BEFORE proposing it (rewrite_report), with the same \`newFigures\` the draft will be proposed with: the figures are laid out at their real size, and the reply ends with the data each new figure shows, so the prose can be checked against it. Fix what it flags with the page budget in the format guide, then check again; a report whose pages are set is the deliverable.`,
      inputSchema: z.object({
        markdown: z.string().optional().describe(
          "A draft body in FASTR Markdown to lay out instead of the current one. It may embed the report's existing figures and the keys of newFigures.",
        ),
        newFigures: newFiguresSchema.describe(
          "With markdown: the figures the draft adds, exactly as you will pass them to rewrite_report.",
        ),
        // The themes are a registry (the engine's own plus this app's
        // `legacy`), so the list is read here, when the tool is built.
        theme: z.enum(fastrThemeIds() as [string, ...string[]]).optional()
          .describe(
            "Lay the draft out under this theme instead of the report's own.",
          ),
      }),
      availableIn: COPILOT_TOOL_VIEWS.get_report_pages,
      kind: "read",
      inProgressLabel: "Laying the report out as pages...",
      completionMessage: "Read the page map",
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
        const added = await resolveNewFigures(ctx, input.newFigures, metrics);
        // A draft keeps the report's own figures and images: the ones it
        // still embeds print at their real size, as they will.
        const detail = {
          ...res.data,
          body: input.markdown !== undefined
            ? collapseFastrBlankRuns(input.markdown)
            : ctx.getBody(),
          figures: { ...ctx.getFigures(), ...Object.fromEntries(added) },
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
      name: "get_page_template",
      description: FASTR_PAGE_TEMPLATE_TOOL_DESCRIPTION,
      inputSchema: z.object({
        layout: z.string().optional().describe(
          "The layout, e.g. story, summary, findings.",
        ),
      }),
      availableIn: COPILOT_TOOL_VIEWS.get_page_template,
      kind: "read",
      inProgressLabel: "Reading the page template...",
      completionMessage: "Read the page template",
      handler: (input) =>
        Promise.resolve(fastrPageTemplateLookup(input.layout)),
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "rewrite_report",
      // The FASTR guide rides the description: with the chat's create_report
      // tool gone (v2), this IS how a report gets written from a prompt, and
      // the per-turn view instructions alone left the model writing plain
      // markdown (the same lesson create_report learned on 2026-09-02). A
      // tool description is in the cached system prompt, so the cost is paid
      // once per conversation.
      description:
        `Propose a full rewrite of the report body, written in FASTR Markdown. The user reviews a diff and accepts or rejects — nothing is applied silently. Keep all existing figure/image tokens you want to retain; you may only reference figure/image ids that already exist.

The body MUST be built from the format's \`:::\` blocks — a plain run of headings and paragraphs is rejected unless you pass plain: true, which you do only when the user asked for a plain document. A draft that adds figures carries them in \`newFigures\` (a metric plus a preset each, as insert_figure takes) and embeds each as \`![caption](figure:<key>)\` where it belongs, so the report and its figures are one change. Before proposing, lay the draft out with get_report_pages (pass it as \`markdown\`, with the same \`newFigures\`), fix every page it flags, and make the prose agree with the data it reports for each new figure. The format:

${FASTR_MD_SYNTAX_DOC}`,
      inputSchema: z.object({
        body: z.string(),
        allowLiteralColors: z.boolean().optional().describe(
          "Set true ONLY when the user explicitly asked for specific literal colours, gradients or image backgrounds (bg=...). Without it, newly-added literal bg= values are rejected — use tones, which follow the theme.",
        ),
        plain: z.boolean().optional().describe(
          "Set true ONLY when the user explicitly asked for a plain document with none of the format's blocks. Without it, a body that uses no blocks is rejected.",
        ),
        newFigures: newFiguresSchema.describe(
          "The figures this draft adds, each embedded in the body as ![caption](figure:<key>). Each becomes a figure of the report when the user accepts.",
        ),
        acceptPageProblems: z.boolean().optional().describe(
          "The draft is laid out before it is proposed, and one whose pages have problems (a short or overfull page, a stub last page, an over-long caption) is refused with the list. Set true ONLY after such a refusal, for a problem you cannot fix, and tell the user which remain.",
        ),
      }),
      availableIn: COPILOT_TOOL_VIEWS.rewrite_report,
      kind: "write",
      approval: {
        propose: async (input, view) => {
          const ctx = view.context;
          const added = await resolveNewFigures(
            ctx,
            input.newFigures,
            metrics,
          );
          const own = embedIdsOf(ctx);
          const edit = rewriteReportBody(ctx.getBody(), input, {
            figures: [...own.figures, ...added.keys()],
            images: own.images,
          });
          if (!edit.ok) return refusedTextEdit(edit);
          let newBody = edit.newBody;
          const addFigures: Record<string, FigureBlock> = {};
          for (const [key, block] of added) {
            const id = crypto.randomUUID();
            const swapped = replaceReportEmbedTokens(
              newBody,
              "figure",
              key,
              (ref) => rewriteReportEmbedToken(ref, { id }),
            );
            if (swapped.count === 0) {
              throw new AIToolFailure(
                `New figure "${key}" is never embedded: add ![caption](figure:${key}) where it belongs, or drop it from newFigures.`,
              );
            }
            newBody = swapped.body;
            addFigures[id] = block;
          }
          if (input.acceptPageProblems !== true) {
            const problems = await pageProblemsOf(ctx, view.params.reportId, {
              body: newBody,
              figures: addFigures,
            });
            if (problems !== undefined) {
              throw new AIToolFailure(
                `Not proposed: the draft's pages have problems the reader would see.\n\n${problems}\n\nFix them (get_report_pages checks a draft) and re-propose. Only if one cannot be fixed, re-propose with acceptPageProblems: true and tell the user which remain.`,
              );
            }
          }
          const prep = ctx.proposeEdit({
            newBody,
            addFigures: added.size > 0 ? addFigures : undefined,
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
                "The user ACCEPTED the rewrite; it is now applied to the report." +
                reportSkippedNote(skipped)
              );
            },
          };
        },
      },
      inProgressLabel: "Proposing rewrite...",
      completionMessage: "Proposed rewrite (awaiting accept/reject)",
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "rewrite_section",
      description:
        "Propose rewriting one heading-bounded section. Address by exact heading text; if the heading is not unique, pass occurrenceIndex (1-based). The section is exactly the range get_report_editor's headings index reports for that heading: from the heading line to the next heading of the same or higher level. newBody replaces that WHOLE range, is written in FASTR Markdown and must include the heading. A section reaches for the format's blocks too — a stat row for its numbers, a callout for its caveat, a band for its turning point (the format is in rewrite_report's description). The user reviews a diff.",
      inputSchema: z.object({
        sectionHeading: z.string(),
        newBody: z.string(),
        occurrenceIndex: z.number().int().positive().optional(),
        allowLiteralColors: z.boolean().optional().describe(
          "Set true ONLY when the user explicitly asked for specific literal colours, gradients or image backgrounds (bg=...). Without it, newly-added literal bg= values are rejected — use tones, which follow the theme.",
        ),
      }),
      availableIn: COPILOT_TOOL_VIEWS.rewrite_section,
      kind: "write",
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
      inProgressLabel: "Proposing section rewrite...",
      completionMessage: "Proposed section rewrite (awaiting accept/reject)",
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "replace_text",
      description:
        "Propose a targeted edit: replace an exact run of text (oldText) with newText. oldText must match the current body VERBATIM (whitespace and markup included) and occur exactly once — if it appears multiple times, pass occurrenceIndex (1-based) or include more surrounding text to make it unique. Use this for small/sentence-level edits, or to act on the user's current selection. Keep any figure/image tokens you intend to retain. The user reviews a diff and accepts or rejects — nothing is applied silently.",
      inputSchema: z.object({
        oldText: z.string(),
        newText: z.string(),
        occurrenceIndex: z.number().int().positive().optional(),
        allowLiteralColors: z.boolean().optional().describe(
          "Set true ONLY when the user explicitly asked for specific literal colours, gradients or image backgrounds (bg=...). Without it, newly-added literal bg= values are rejected — use tones, which follow the theme.",
        ),
      }),
      availableIn: COPILOT_TOOL_VIEWS.replace_text,
      kind: "write",
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
      inProgressLabel: "Proposing edit...",
      completionMessage: "Proposed edit (awaiting accept/reject)",
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "insert_figure",
      description:
        "Propose inserting a live data figure. The `figure` is a `from_metric` block: a metric plus one of its presets (get metricIds and presets from get_available_metrics), exactly like slide figures, resolved under the report's own results package and scope. Optionally place it after a heading (afterHeading must match an existing heading's text, or the call errors; omit to append at the end) and give a caption. The user reviews a diff; on accept the figure is added to the report and its token inserted.",
      inputSchema: z.object({
        figure: AiFigureFromMetricSchema,
        caption: z.string().optional(),
        afterHeading: z.string().optional(),
      }),
      availableIn: COPILOT_TOOL_VIEWS.insert_figure,
      kind: "write",
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
                  : "")
              );
            },
          };
        },
      },
      inProgressLabel: "Preparing figure...",
      completionMessage: "Proposed figure insert (awaiting accept/reject)",
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "replace_figure",
      description:
        "Propose replacing the chart behind an existing report figure. figureId is one of the figure:<id> tokens (from get_report_editor). The replacement `figure` is the same `from_metric` block as insert_figure (a metric plus one of its presets). The caption is kept unless you pass a new `caption` — note that if this figure is embedded more than once, a new `caption` is applied to EVERY embed of it, so omit `caption` when you only mean to change the chart. The token is swapped in place, so the user reviews a diff and accepts or rejects. To merely TWEAK an existing figure (its replicant, filters, disaggregation, period, or captions) WITHOUT changing the underlying chart, use update_report_figure instead — replacing here rebuilds the figure and resets settings like the replicant.",
      inputSchema: z.object({
        figureId: z.string(),
        figure: AiFigureFromMetricSchema,
        caption: z.string().optional(),
      }),
      availableIn: COPILOT_TOOL_VIEWS.replace_figure,
      kind: "write",
      approval: {
        propose: async (input, view) => {
          const ctx = view.context;
          if (!ctx.getFigures()[input.figureId]) {
            throw new AIToolFailure(
              `No figure with id "${input.figureId}" in this report. Call get_report_editor to see figure ids.`,
            );
          }
          if (
            !findReportEmbeds(ctx.getBody()).some(
              (r) => r.kind === "figure" && r.id === input.figureId,
            )
          ) {
            throw new AIToolFailure(
              `Figure "${input.figureId}" is registered but its token isn't in the body. Call get_report_editor.`,
            );
          }
          const figureBlock = await resolveFigureFromMetric(
            view.context.getScope(),
            input.figure,
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
                  : "")
              );
            },
          };
        },
      },
      inProgressLabel: "Preparing figure...",
      completionMessage: "Proposed figure replacement (awaiting accept/reject)",
    }),
  ];
}
