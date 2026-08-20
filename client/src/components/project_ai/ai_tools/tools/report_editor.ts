import { AIToolFailure, createAITool } from "panther";
import { z } from "zod";
import {
  AiFigureBlockInputSchema,
  AiFigureConfigPatchSchema,
  buildReportEmbedToken,
  type FigureBlock,
  findReportEmbeds,
  findReportHeadings,
  getReplicateByProp,
  insertAfterReportHeading,
  type MetricWithStatus,
  type PeriodBounds,
  periodFilterHasBounds,
  replaceReportEmbedTokens,
  type ReportFormat,
  type ReportHeading,
  type ResultsValueInfoForPresentationObject,
  rewriteReportEmbedToken,
  spliceReportSection,
} from "lib";
import {
  applyFigureConfigPatch,
  assertNoSlotCollision,
  describeFigureConfigPatchEffect,
  resolveBundleFromMetricAndConfig,
  validateFigureConfigEdit,
} from "~/generate_visualization/mod";
import { getResultsValueInfoForPresentationObjectFromCacheOrFetch } from "~/state/project/t2_presentation_objects";
import { projectAIViews } from "~/components/project_ai/ai_views";
import { formatLineRanges } from "~/components/report/rebase_edits";
import { resolveFigureFromVisualization } from "~/components/slide_deck/slide_ai/resolve_figure_from_visualization";
import { resolveFigureFromMetric } from "~/components/slide_deck/slide_ai/resolve_figure_from_metric";
import { formatFigureConfigForAI } from "./_internal/format_figure_config_for_ai";
import { validateMetricInputs } from "../validators/content_validators";
import {
  validateStyledReportHasStylesheet,
  validateReportBodyDelta,
  validateReportBodyForFormat,
  validateReportBodyLength,
  validateReportTokensResolve,
} from "../validators/report_validators";

// Appended to a tool's ACCEPTED message when the accept-time rebase skipped
// hunks that collided with a collaborator's concurrent edits — the AI must
// know its edit only partially applied, and where.
function skippedNote(
  skipped: { fromLine: number; toLine: number }[] | undefined,
): string {
  if (!skipped || skipped.length === 0) return "";
  return ` NOTE: the proposed change(s) at line(s) ${formatLineRanges(
    skipped,
  )} were NOT applied — a collaborator edited that text while the proposal was open. Re-read the report (get_report_editor) before retrying those parts.`;
}

// Replace one verbatim occurrence of oldText with newText. Ambiguous matches
// require occurrenceIndex (1-based), same convention as spliceReportSection.
function replaceTextOccurrence(
  body: string,
  oldText: string,
  newText: string,
  occurrenceIndex: number | undefined,
): { newBody: string } | { error: string } {
  if (oldText === "") {
    return { error: "oldText must not be empty." };
  }
  const positions: number[] = [];
  let from = 0;
  for (;;) {
    const idx = body.indexOf(oldText, from);
    if (idx < 0) break;
    positions.push(idx);
    from = idx + oldText.length;
  }
  if (positions.length === 0) {
    return {
      error:
        "oldText was not found verbatim. Call get_report_editor to see the exact current text (whitespace and markup must match).",
    };
  }
  let pos: number;
  if (positions.length === 1) {
    pos = positions[0];
  } else {
    if (occurrenceIndex === undefined) {
      return {
        error: `oldText occurs ${positions.length} times. Provide occurrenceIndex (1-${positions.length}), or include more surrounding text to make it unique.`,
      };
    }
    const p = positions[occurrenceIndex - 1];
    if (p === undefined) {
      return {
        error: `occurrenceIndex ${occurrenceIndex} out of range (1-${positions.length}).`,
      };
    }
    pos = p;
  }
  const newBody =
    body.slice(0, pos) + newText + body.slice(pos + oldText.length);
  return { newBody };
}

// The headings index for get_report_editor: where each section starts/ends
// (1-based lines) and, for HTML, whether it is a wrapper element or a flat
// run — exactly what rewrite_section will replace.
function formatHeadingsIndex(headings: ReportHeading[], format: ReportFormat): string[] {
  if (headings.length === 0) return [`## Headings: none`];
  return [
    `## Headings (section = what rewrite_section replaces; lines are 1-based)`,
    ...headings.map((h) => {
      const range = h.section.fromLine === h.section.toLine
        ? `line ${h.section.fromLine}`
        : `lines ${h.section.fromLine}-${h.section.toLine}`;
      const mode = format === "html"
        ? h.section.mode === "wrapper"
          ? ` · wrapper <${h.section.wrapperTag}>`
          : ` · flat`
        : "";
      return `- line ${h.line}: ${"#".repeat(h.level)} ${h.text} → section ${range}${mode}`;
    }),
  ];
}

// One cheap index line per figure for get_report_editor — pure, no fetch.
function formatFigureIndexLine(id: string, fig: FigureBlock): string {
  if (!fig.bundle) return `- figure:${id} — (no data)`;
  const cfg = fig.bundle.config;
  const parts = [`figure:${id}`, fig.bundle.metricId, cfg.d.type];
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
  projectId: string,
  metrics: MetricWithStatus[],
) {
  return [
    createAITool({
      viewRegistry: projectAIViews,
      name: "get_report_editor",
      description:
        "Get the report's current body (markdown or HTML — stated in the output), a headings index (each heading's line and the exact section range rewrite_section would replace), a one-line index of each embedded figure (id, metric, type, caption, active replicant), and the embedded image ids (live editor state, including unsaved changes). ALWAYS call this first before proposing edits. For a figure's full config (available replicant values, slots, filters) call get_report_figure.",
      inputSchema: z.object({}),
      availableIn: ["editing_report"],
      kind: "read",
      handler: async (_input, view) => {
        const ctx = view.context;
        const figs = ctx.getFigures();
        const figureIds = Object.keys(figs);
        const imgIds = Object.keys(ctx.getImages());
        const sel = ctx.getSelection();
        const selectionSection =
          sel && !sel.empty
            ? [
                ``,
                `## User's current selection (lines ${sel.fromLine}-${sel.toLine})`,
                sel.text,
              ]
            : [
                `## User's current selection: none (cursor at line ${sel?.fromLine ?? 1})`,
              ];
        const figureSection = figureIds.length
          ? [
              `## Figures (call get_report_figure for full config; update_report_figure to edit in place):`,
              ...figureIds.map((id) => formatFigureIndexLine(id, figs[id])),
            ]
          : [`## Figures: none`];
        const format = view.params.format;
        const body = ctx.getBody();
        const readStyleName = view.params.customStyle
          ? `CUSTOM "${view.params.customStyle.label}"`
          : view.params.htmlStyle && view.params.htmlStyle !== "default"
          ? view.params.htmlStyle.toUpperCase()
          : undefined;
        const styleNote = format === "html"
          ? readStyleName
            ? ` · Style: ${readStyleName} (full-body rewrites must be fully designed pages — see the Design brief in your instructions)`
            : ` · Style: default`
          : "";
        return [
          `# REPORT EDITOR: ${view.params.reportLabel}`,
          `Format: ${format}${styleNote}${
            format === "html"
              ? ` — embed tokens are ${buildReportEmbedToken("html", "figure", "<id>", "caption")}`
              : ""
          }`,
          ``,
          `## Current body (${format})`,
          body,
          ``,
          ...formatHeadingsIndex(findReportHeadings(body, format), format),
          ``,
          ...figureSection,
          `## Images: ${imgIds.length ? imgIds.map((id) => `image:${id}`).join(", ") : "none"}`,
          ...selectionSection,
        ].join("\n");
      },
      inProgressLabel: "Reading report editor...",
      completionMessage: "Read report editor",
    }),

    createAITool({
      viewRegistry: projectAIViews,
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
      availableIn: ["editing_report"],
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
        const metric = metrics.find((m) => m.id === bundle.metricId);
        return await formatFigureConfigForAI(projectId, metric, bundle.config, bundle.dateRange);
      },
      inProgressLabel: "Reading figure...",
      completionMessage: "Read figure",
    }),

    createAITool({
      viewRegistry: projectAIViews,
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
      availableIn: ["editing_report"],
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
          !findReportEmbeds(ctx.getBody(), view.params.format).some(
            (r) => r.kind === "figure" && r.id === input.figureId,
          )
        ) {
          throw new AIToolFailure(
            `Figure "${input.figureId}" is registered but its token isn't in the report body. Call get_report_editor.`,
          );
        }
        // metricId/type are not in the patch schema (silently stripped), so an
        // all-unsupported patch arrives empty — reject it instead of re-resolving
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
        const metric = metrics.find((m) => m.id === bundle.metricId);
        if (!metric) {
          throw new AIToolFailure(
            `Metric "${bundle.metricId}" not found in this project.`,
          );
        }

        // Pre-flight for a stored defect this tool cannot repair (the figure
        // patch schema carries no timeseriesGrouping) — see update_figure.
        if (
          bundle.config.d.type === "timeseries" &&
          !bundle.config.d.timeseriesGrouping
        ) {
          throw new AIToolFailure(
            "This figure's stored config is a timeseries with no period grouping, which cannot render. It cannot be repaired here — the user must fix it in the visualization editor (or the figure must be recreated via replace_figure). No changes were applied.",
          );
        }

        // Hoisted conditional fetch: period bounds (open-ended periodFilter)
        // + possible-values map (pre-write collision check) — see update_figure.
        const pf = input.patch.periodFilter;
        const needsBounds = typeof pf === "object" && pf !== null &&
          (pf.min == null) !== (pf.max == null);
        const needsPossibleValues = input.patch.disaggregateBy !== undefined ||
          input.patch.valuesDisDisplayOpt !== undefined;
        let dataBounds: PeriodBounds | undefined;
        let disaggregationPossibleValues:
          | ResultsValueInfoForPresentationObject["disaggregationPossibleValues"]
          | undefined;
        if (needsBounds || needsPossibleValues) {
          const infoRes = await getResultsValueInfoForPresentationObjectFromCacheOrFetch(
            projectId,
            bundle.metricId,
          );
          if (infoRes.success) {
            dataBounds = infoRes.data.periodBounds;
            disaggregationPossibleValues = infoRes.data.disaggregationPossibleValues;
          }
          if (needsBounds && !dataBounds) {
            throw new AIToolFailure(
              "Cannot set an open-ended periodFilter: the metric's data period range is unavailable. Provide both min and max.",
            );
          }
        }

        // Validate UP FRONT (a throw must mean "nothing changed"); commit once valid.
        const newConfig = applyFigureConfigPatch(
          bundle.config,
          input.patch,
          metric,
          dataBounds,
        );
        validateFigureConfigEdit(bundle.config, newConfig, input.patch, metric, {
          disaggregationPossibleValues,
        });

        const filters =
          newConfig.d.filterBy.length > 0 ? newConfig.d.filterBy : undefined;
        const periodFilter =
          newConfig.d.periodFilter && periodFilterHasBounds(newConfig.d.periodFilter)
            ? {
                min: newConfig.d.periodFilter.min,
                max: newConfig.d.periodFilter.max,
              }
            : undefined;
        await validateMetricInputs(
          projectId,
          bundle.metricId,
          filters,
          periodFilter,
        );

        const report = describeFigureConfigPatchEffect(
          bundle.config,
          input.patch,
          metric,
          dataBounds,
        );

        const newBundle = await resolveBundleFromMetricAndConfig(
          projectId,
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
        return `Updated figure ${input.figureId}.\n${report.map((l) => `- ${l}`).join("\n")}\nThe preview is updated and saved.`;
      },
      inProgressLabel: "Updating figure...",
      completionMessage: "Updated figure",
    }),

    createAITool({
      viewRegistry: projectAIViews,
      name: "rewrite_report",
      description:
        "Propose a full rewrite of the report body, written in the report's format (markdown or HTML — see get_report_editor). The user reviews a diff and accepts or rejects — nothing is applied silently. Keep all existing figure/image tokens you want to retain; you may only reference figure/image ids that already exist. HTML bodies must be body-only, well-formed markup.",
      inputSchema: z.object({ body: z.string() }),
      availableIn: ["editing_report"],
      kind: "write",
      approval: {
        propose: async (input, view) => {
          const ctx = view.context;
          const format = view.params.format;
          validateReportBodyLength(input.body);
          validateReportBodyForFormat(input.body, format);
          const styleName = view.params.customStyle?.label ??
            (view.params.htmlStyle && view.params.htmlStyle !== "default"
              ? view.params.htmlStyle
              : undefined);
          validateStyledReportHasStylesheet(input.body, format, styleName);
          validateReportTokensResolve(
            input.body,
            ctx.getFigures(),
            ctx.getImages(),
            format,
          );
          const prep = ctx.proposeEdit({
            newBody: input.body,
            summary: "Rewrite entire report",
          });
          if ("skip" in prep) return prep;
          return {
            preview: prep.preview,
            customProposalUI: prep.customProposalUI,
            stillValid: prep.stillValid,
            commit: async () => {
              const { skipped } = await prep.commit();
              return (
                "The user ACCEPTED the rewrite; it is now applied to the report." +
                skippedNote(skipped)
              );
            },
          };
        },
      },
      inProgressLabel: "Proposing rewrite...",
      completionMessage: "Proposed rewrite (awaiting accept/reject)",
    }),

    createAITool({
      viewRegistry: projectAIViews,
      name: "rewrite_section",
      description:
        "Propose rewriting one heading-bounded section. Address by exact heading text; if the heading is not unique, pass occurrenceIndex (1-based). The section is exactly the range get_report_editor's headings index reports for that heading: markdown — from the heading line to the next heading of the same or higher level; HTML — either the heading's wrapper element (the <section>/<div> that starts with the heading and holds no other heading of that level — mode 'wrapper', and then newBody must START with that same wrapper tag and contain the whole element) or the flat run of siblings to the next such heading (mode 'flat', newBody starts with the heading). newBody replaces that WHOLE range, is written in the report's format and must include the heading. The user reviews a diff.",
      inputSchema: z.object({
        sectionHeading: z.string(),
        newBody: z.string(),
        occurrenceIndex: z.number().int().positive().optional(),
      }),
      availableIn: ["editing_report"],
      kind: "write",
      approval: {
        propose: async (input, view) => {
          const ctx = view.context;
          const format = view.params.format;
          validateReportBodyForFormat(input.newBody, format);
          const result = spliceReportSection(
            ctx.getBody(),
            format,
            input.sectionHeading,
            input.newBody,
            input.occurrenceIndex,
          );
          if ("error" in result) {
            throw new AIToolFailure(result.error);
          }
          validateReportBodyLength(result.newBody);
          validateReportTokensResolve(
            result.newBody,
            ctx.getFigures(),
            ctx.getImages(),
            format,
          );
          const prep = ctx.proposeEdit({
            newBody: result.newBody,
            summary: `Rewrite section "${input.sectionHeading}"`,
          });
          if ("skip" in prep) return prep;
          return {
            preview: prep.preview,
            customProposalUI: prep.customProposalUI,
            stillValid: prep.stillValid,
            commit: async () => {
              const { skipped } = await prep.commit();
              return (
                `The user ACCEPTED the rewrite of section "${input.sectionHeading}"; it is now applied.` +
                skippedNote(skipped)
              );
            },
          };
        },
      },
      inProgressLabel: "Proposing section rewrite...",
      completionMessage: "Proposed section rewrite (awaiting accept/reject)",
    }),

    createAITool({
      viewRegistry: projectAIViews,
      name: "replace_text",
      description:
        "Propose a targeted edit: replace an exact run of text (oldText) with newText. oldText must match the current body VERBATIM (whitespace and markup included) and occur exactly once — if it appears multiple times, pass occurrenceIndex (1-based) or include more surrounding text to make it unique. Use this for small/sentence-level edits, or to act on the user's current selection. Keep any figure/image tokens you intend to retain; in an HTML report the edit may span tag boundaries but must leave the document as well-formed as it was. The user reviews a diff and accepts or rejects — nothing is applied silently.",
      inputSchema: z.object({
        oldText: z.string(),
        newText: z.string(),
        occurrenceIndex: z.number().int().positive().optional(),
      }),
      availableIn: ["editing_report"],
      kind: "write",
      approval: {
        propose: async (input, view) => {
          const ctx = view.context;
          const format = view.params.format;
          const base = ctx.getBody();
          const result = replaceTextOccurrence(
            base,
            input.oldText,
            input.newText,
            input.occurrenceIndex,
          );
          if ("error" in result) {
            throw new AIToolFailure(result.error);
          }
          validateReportBodyLength(result.newBody);
          validateReportBodyDelta(base, result.newBody, format);
          validateReportTokensResolve(
            result.newBody,
            ctx.getFigures(),
            ctx.getImages(),
            format,
          );
          const prep = ctx.proposeEdit({
            newBody: result.newBody,
            summary: "Replace text",
          });
          if ("skip" in prep) return prep;
          return {
            preview: prep.preview,
            customProposalUI: prep.customProposalUI,
            stillValid: prep.stillValid,
            commit: async () => {
              const { skipped } = await prep.commit();
              return (
                "The user ACCEPTED the edit; it is now applied to the report." +
                skippedNote(skipped)
              );
            },
          };
        },
      },
      inProgressLabel: "Proposing edit...",
      completionMessage: "Proposed edit (awaiting accept/reject)",
    }),

    createAITool({
      viewRegistry: projectAIViews,
      name: "insert_figure",
      description:
        "Propose inserting a live data figure. The `figure` is either a `from_visualization` block (clone a saved visualization by id — get ids from get_available_visualizations) or a `from_metric` block (build a NEW chart from a metric + preset — get metricIds/presets from get_available_metrics), exactly like slide figures. Optionally place it after a heading (afterHeading — must match an existing heading's text, or the call errors; omit to append at the end — in an HTML report always pass afterHeading so the figure lands inside the right section) and give a caption. The token is written in the report's format. The user reviews a diff; on accept the figure is added to the report and its token inserted.",
      inputSchema: z.object({
        figure: AiFigureBlockInputSchema,
        caption: z.string().optional(),
        afterHeading: z.string().optional(),
      }),
      availableIn: ["editing_report"],
      kind: "write",
      approval: {
        propose: async (input, view) => {
          const ctx = view.context;
          const figureBlock =
            input.figure.type === "from_visualization"
              ? await resolveFigureFromVisualization(projectId, input.figure)
              : await resolveFigureFromMetric(projectId, input.figure, metrics);
          const id = crypto.randomUUID();
          const format = view.params.format;
          const caption = (input.caption ?? "").replace(/\s+/g, " ").trim();
          const token = buildReportEmbedToken(format, "figure", id, caption);
          const result = insertAfterReportHeading(
            ctx.getBody(),
            format,
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
              return (
                `The user ACCEPTED the figure insert (id ${id}); it is now in the report.` +
                skippedNote(skipped) +
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
      viewRegistry: projectAIViews,
      name: "replace_figure",
      description:
        "Propose replacing the chart behind an existing report figure. figureId is one of the figure:<id> tokens (from get_report_editor). The replacement `figure` is the same slide-style union as insert_figure (from_visualization to clone a saved viz, or from_metric to build a new chart). The caption is kept unless you pass a new `caption` — note that if this figure is embedded more than once, a new `caption` is applied to EVERY embed of it, so omit `caption` when you only mean to change the chart. The token is swapped in place, so the user reviews a diff and accepts or rejects. To merely TWEAK an existing figure (its replicant, filters, disaggregation, period, or captions) WITHOUT changing the underlying chart, use update_report_figure instead — replacing here rebuilds the figure and resets settings like the replicant.",
      inputSchema: z.object({
        figureId: z.string(),
        figure: AiFigureBlockInputSchema,
        caption: z.string().optional(),
      }),
      availableIn: ["editing_report"],
      kind: "write",
      approval: {
        propose: async (input, view) => {
          const ctx = view.context;
          const format = view.params.format;
          if (!ctx.getFigures()[input.figureId]) {
            throw new AIToolFailure(
              `No figure with id "${input.figureId}" in this report. Call get_report_editor to see figure ids.`,
            );
          }
          if (
            !findReportEmbeds(ctx.getBody(), format).some(
              (r) => r.kind === "figure" && r.id === input.figureId,
            )
          ) {
            throw new AIToolFailure(
              `Figure "${input.figureId}" is registered but its token isn't in the body. Call get_report_editor.`,
            );
          }
          const figureBlock =
            input.figure.type === "from_visualization"
              ? await resolveFigureFromVisualization(projectId, input.figure)
              : await resolveFigureFromMetric(projectId, input.figure, metrics);
          const newId = crypto.randomUUID();
          const overrideCaption =
            input.caption !== undefined
              ? input.caption.replace(/\s+/g, " ").trim()
              : undefined;
          // Swap every token for this figure id (preserving each caption unless
          // overridden, and — for HTML — the token's other attributes) to a
          // fresh id pointing at the new figure block. A caption override
          // therefore rewrites EVERY embed of this id, which is destructive
          // when the same figure is embedded twice with different captions —
          // the tool input has no occurrence selector, so the count is surfaced
          // in the summary and the user sees the full rewrite in the
          // accept/reject diff.
          const swapped = replaceReportEmbedTokens(
            ctx.getBody(),
            format,
            "figure",
            input.figureId,
            (ref) =>
              rewriteReportEmbedToken(
                ref,
                { id: newId, caption: overrideCaption },
                format,
              ),
          );
          const embedCount = swapped.count;
          const newBody = swapped.body;
          validateReportBodyLength(newBody);
          validateReportTokensResolve(
            newBody,
            { ...ctx.getFigures(), [newId]: figureBlock },
            ctx.getImages(),
            format,
          );
          const prep = ctx.proposeEdit({
            newBody,
            addFigures: { [newId]: figureBlock },
            summary:
              overrideCaption !== undefined && embedCount > 1
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
              return (
                `The user ACCEPTED the figure replacement (new id ${newId}); it is now in the report.` +
                skippedNote(skipped) +
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
