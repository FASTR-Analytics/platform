import { IMAGE_LIMITS } from "@timroberton/panther";
import { z } from "zod";
import {
  FASTR_MD_SYNTAX_DOC,
  FASTR_PAGE_TEMPLATE_TOOL_DESCRIPTION,
  fastrThemeIds,
} from "../../report-forge/engine/mod.ts";
// Registers this app's `legacy` theme, which get_report_pages's theme enum
// reads from the registry as this module loads.
import "../report_legacy_theme.ts";
import {
  AiFigureConfigPatchSchema,
  AiFigureFromMetricSchema,
} from "../types/ai_input.ts";
import { MAX_LOOK_SUBJECTS } from "./read_bounds.ts";

// The report tools' contracts: see copilot_catalogue.ts.

// Figures a draft adds: each a metric plus a preset, named by a short key the
// body embeds as `![caption](figure:<key>)`. rewrite_report swaps each key for
// a fresh id, so a whole report and its figures are one diff, and the draft
// get_report_pages lays out has the figures it will print with.
const NEW_FIGURE_KEY_RE = /^[a-z][a-z0-9-]{0,39}$/;

const newFiguresSchema = z.array(z.strictObject({
  key: z.string().regex(NEW_FIGURE_KEY_RE).describe(
    "A short lowercase name for this figure, e.g. trend or by-region. The body embeds it as ![caption](figure:<key>).",
  ),
  figure: AiFigureFromMetricSchema,
})).optional();

const draftEditsSchema = z.array(z.strictObject({
  oldText: z.string(),
  newText: z.string(),
  occurrenceIndex: z.number().int().positive().optional(),
})).optional();

export const REPORT_TOOL_CONTRACTS = {
  get_report_editor: {
    description:
      "Get the report's current body (FASTR Markdown), a headings index (each heading's line and the exact section range rewrite_section would replace), a one-line index of each embedded figure (id, metric, type, caption, active replicant), and the embedded image ids (live editor state, including unsaved changes). ALWAYS call this first before proposing edits. For a figure's full config (the active replicant and the count of its values, slots, filters) call get_report_figure.",
    kind: "read",
    inputSchema: z.strictObject({}),
  },

  get_report_figure: {
    description:
      "Get the FULL configuration of one report figure: its metric, type, " +
      "disaggregations, filters, the active replicant and the count of its " +
      "values, display slots, captions, and the metric's available " +
      "dimensions. Call this before update_report_figure to see what a figure " +
      "shows; get_dimension_values lists the values a replicant or filter " +
      "takes. figureId is the id after 'figure:' in get_report_editor.",
    kind: "read",
    inputSchema: z.strictObject({
      figureId: z
        .string()
        .describe(
          "Figure id from get_report_editor (the part after 'figure:').",
        ),
    }),
  },

  update_report_figure: {
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
    kind: "write",
    inputSchema: z.strictObject({
      figureId: z
        .string()
        .describe(
          "Figure id from get_report_editor (the part after 'figure:').",
        ),
      patch: AiFigureConfigPatchSchema,
    }),
  },

  get_report_pages: {
    description:
      `Lay this FASTR Markdown report out as its printed pages (A4 unless the report says otherwise; the pages the PDF and the editor show) and return the page map: every page's fill, the blocks that landed on it with each one's share of the page, and the problems: a page left short (because its next block moved whole to the following page, or because a page break or a page template ends it early), a page holding only the spill of the section before it, a page template whose content stops part way down its page or holds more than it shows, two figures back to back, and a last page that is a stub. Call it with no arguments for the report as it stands (live editor state). Before a rewrite_section that changes what a page holds, pass \`sectionHeading\` and \`newBody\` exactly as rewrite_section will take them, and the report is laid out with that section swapped in: never paste the whole body to check one section. A whole-report draft needs no check here: rewrite_report lays it out itself and holds it while it has problems. (\`markdown\`, with \`newFigures\`, lays out an arbitrary whole body; the reply then ends with the data each new figure shows.) Fix what it flags with the page budget in the format guide, then check again; a report whose pages are set is the deliverable.`,
    kind: "read",
    inputSchema: z.strictObject({
      markdown: z.string().optional().describe(
        "A draft body in FASTR Markdown to lay out instead of the current one. It may embed the report's existing figures and the keys of newFigures.",
      ),
      newFigures: newFiguresSchema.describe(
        "With markdown: the figures the draft adds, exactly as you will pass them to rewrite_report.",
      ),
      sectionHeading: z.string().optional().describe(
        "With newBody: the section a rewrite_section would replace, addressed as rewrite_section addresses it.",
      ),
      newBody: z.string().optional().describe(
        "With sectionHeading: the section's new text, heading included, as rewrite_section takes it.",
      ),
      occurrenceIndex: z.number().int().positive().optional().describe(
        "With sectionHeading, for a heading that occurs more than once (1-based).",
      ),
      theme: z.enum(fastrThemeIds() as [string, ...string[]]).optional()
        .describe(
          "Lay the draft out under this theme instead of the report's own.",
        ),
    }),
  },

  get_page_template: {
    description: FASTR_PAGE_TEMPLATE_TOOL_DESCRIPTION,
    kind: "read",
    // Every layout in one call: a call per layout spends a round per layout,
    // and a turn's rounds are capped.
    inputSchema: z.strictObject({
      layouts: z.array(z.string()).optional().describe(
        'Every layout the report will use, e.g. ["exec", "summary", "findings"].',
      ),
      layout: z.string().optional().describe(
        "One layout; prefer layouts.",
      ),
    }),
  },

  rewrite_report: {
    // The FASTR guide rides the description: with the chat's create_report
    // tool gone (v2), this IS how a report gets written from a prompt, and
    // the per-turn view instructions alone left the model writing plain
    // markdown (the same lesson create_report learned on 2026-09-02). A
    // tool description is in the cached system prompt, so the cost is paid
    // once per conversation.
    description:
      `Propose a full rewrite of the report body, written in FASTR Markdown. The user reviews a diff and accepts or rejects — nothing is applied silently. Keep all existing figure/image tokens you want to retain; you may only reference figure/image ids that already exist.

The body MUST be built from the format's \`:::\` blocks — a plain run of headings and paragraphs is rejected unless you pass plain: true, which you do only when the user asked for a plain document. A draft that adds figures carries them in \`newFigures\` (a metric plus a preset each, as insert_figure takes) and embeds each as \`![caption](figure:<key>)\` where it belongs, so the report and its figures are one change. Write the body ONCE: this tool lays the draft out itself, and a draft whose pages have problems, or that adds figures, is held rather than proposed, with the page map's problems and what each new figure shows. Fix a held draft with edit_report_draft (small exact replacements, then it proposes); never resend the whole body, and never pre-check a whole draft with get_report_pages. The format:

${FASTR_MD_SYNTAX_DOC}`,
    kind: "write",
    inputSchema: z.strictObject({
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
        "Leave unset: a draft whose pages have problems is held, and the waiver goes on edit_report_draft after a refusal. Set true ONLY for a problem you cannot fix, and tell the user which remain. It never waives a problem marked MUST FIX (a page more than half empty).",
      ),
    }),
  },

  edit_report_draft: {
    description:
      "Fix the draft rewrite_report is holding, then propose it. rewrite_report holds a draft it laid out and could not propose yet: its pages had problems, it broke a rule, or it adds figures whose data the prose must match. Each edit replaces one exact run of the draft's text (oldText, verbatim as you wrote it, whitespace and markup included, unique unless occurrenceIndex is given) with newText; edits apply in order, all or none, and new figures stay embedded by their keys (removing a figure's embed drops it). Move a paragraph by deleting it in one edit and inserting it in another. The edited draft is checked and laid out again: proposed to the user when its pages are set, or refused with what remains and still held. With no edits it proposes the held draft as it stands. This is far cheaper than resending the body: never call rewrite_report again to fix a held draft.",
    kind: "write",
    inputSchema: z.strictObject({
      edits: draftEditsSchema,
      acceptPageProblems: z.boolean().optional().describe(
        "Set true ONLY after a refusal, for a page problem you cannot fix, and tell the user which remain. It never waives a problem marked MUST FIX (a page more than half empty).",
      ),
    }),
  },

  rewrite_section: {
    description:
      "Propose rewriting one heading-bounded section. Address by exact heading text; if the heading is not unique, pass occurrenceIndex (1-based). The section is exactly the range get_report_editor's headings index reports for that heading: from the heading line to the next heading of the same or higher level. newBody replaces that WHOLE range, is written in FASTR Markdown and must include the heading. A section reaches for the format's blocks too — a stat row for its numbers, a callout for its caveat, a band for its turning point (the format is in rewrite_report's description). The user reviews a diff.",
    kind: "write",
    inputSchema: z.strictObject({
      sectionHeading: z.string(),
      newBody: z.string(),
      occurrenceIndex: z.number().int().positive().optional(),
      allowLiteralColors: z.boolean().optional().describe(
        "Set true ONLY when the user explicitly asked for specific literal colours, gradients or image backgrounds (bg=...). Without it, newly-added literal bg= values are rejected — use tones, which follow the theme.",
      ),
    }),
  },

  replace_text: {
    description:
      "Propose a targeted edit: replace an exact run of text (oldText) with newText. oldText must match the current body VERBATIM (whitespace and markup included) and occur exactly once — if it appears multiple times, pass occurrenceIndex (1-based) or include more surrounding text to make it unique. Use this for small/sentence-level edits, or to act on the user's current selection. Keep any figure/image tokens you intend to retain. The user reviews a diff and accepts or rejects — nothing is applied silently.",
    kind: "write",
    inputSchema: z.strictObject({
      oldText: z.string(),
      newText: z.string(),
      occurrenceIndex: z.number().int().positive().optional(),
      allowLiteralColors: z.boolean().optional().describe(
        "Set true ONLY when the user explicitly asked for specific literal colours, gradients or image backgrounds (bg=...). Without it, newly-added literal bg= values are rejected — use tones, which follow the theme.",
      ),
    }),
  },

  insert_figure: {
    description:
      "Propose inserting a live data figure. The `figure` is a `from_metric` block: a metric plus one of its presets (get metricIds and presets from get_available_metrics), exactly like slide figures, resolved under the report's own results package and scope. Optionally place it after a heading (afterHeading must match an existing heading's text, or the call errors; omit to append at the end) and give a caption. The user reviews a diff; on accept the figure is added to the report and its token inserted.",
    kind: "write",
    inputSchema: z.strictObject({
      figure: AiFigureFromMetricSchema,
      caption: z.string().optional(),
      afterHeading: z.string().optional(),
    }),
  },

  replace_figure: {
    description:
      "Propose replacing the chart behind an existing report figure. figureId is one of the figure:<id> tokens (from get_report_editor). The replacement `figure` is the same `from_metric` block as insert_figure (a metric plus one of its presets), except that its `chartTitle` may be omitted. The chart title and the embed caption are each kept unless given: omit `figure.chartTitle` to keep the replaced chart's title, and omit `caption` to keep the embed's caption. Note that if this figure is embedded more than once, a new `caption` is applied to EVERY embed of it, so omit `caption` when you only mean to change the chart. The token is swapped in place, so the user reviews a diff and accepts or rejects. To merely TWEAK an existing figure (its replicant, filters, disaggregation, period, or captions) WITHOUT changing the underlying chart, use update_report_figure instead — replacing here rebuilds the figure and resets settings like the replicant.",
    kind: "write",
    inputSchema: z.strictObject({
      figureId: z.string(),
      figure: AiFigureFromMetricSchema.extend({
        chartTitle: AiFigureFromMetricSchema.shape.chartTitle.optional()
          .describe(
            "Title displayed above the figure. Omit to keep the replaced chart's title.",
          ),
      }),
      caption: z.string().optional(),
    }),
  },

  get_report_figure_images: {
    description:
      `Look at one to ${MAX_LOOK_SUBJECTS} figures of the open report as images, each drawn as the report shows it: in the report's chart palette, in the ink of the ground it sits on, with any change not yet saved. Use it to judge what a figure's configuration cannot tell you: whether its labels, legend and table cells can be read, whether its series can be told apart. The images come back in the order asked, and the result gives each one's size in pixels: a figure too tall for one image is drawn narrower. You see an image for the rest of this turn and not after, so say in your reply what it showed. Looking again is one call and shows the figure as it is then. A turn takes at most ${IMAGE_LIMITS.MAX_PER_TURN} images.`,
    kind: "read",
    inputSchema: z.strictObject({
      figureIds: z
        .array(z.string())
        .min(1)
        .max(MAX_LOOK_SUBJECTS)
        .describe(
          `Array of one to ${MAX_LOOK_SUBJECTS} figure ids from get_report_editor (the part after 'figure:').`,
        ),
    }),
  },
} as const;
