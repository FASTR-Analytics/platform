// Ready-made tools for a host whose assistant should edit the open document:
// a name, a description, a plain JSON Schema and a function, which is what
// every tool-calling model client takes. The host supplies the document and
// the accept/reject step (the mounted editor's handle does both); the chat,
// the prompts and the model client stay the host's.

import { collapseFastrBlankRuns } from "../engine/fastr_markdown_blocks.ts";
import { FASTR_MD_SYNTAX_DOC } from "../engine/fastr_markdown_spec.ts";
import type { SkippedRange } from "../engine/line_ranges.ts";
import {
  readReportText,
  replaceReportText,
  reportSkippedNote,
  type ReportTextEdit,
  type ReportTextSelection,
  rewriteReportBody,
  rewriteReportSection,
} from "./operations.ts";
import type { ReportEmbedIds } from "./validators.ts";

// What the tools need from the host. With a mounted editor, `getSelection`
// and `proposeEdit` are its handle's own (ReportForgeApi).
export type ReportTextToolsHost = {
  // The document as it stands, unsaved changes included.
  getBody: () => string;
  getSelection?: () => ReportTextSelection | undefined;
  // Show the user the new body as an accept/reject diff over the current
  // one, apply it on accept, and say what they decided. `skipped` lists the
  // line ranges an accepted edit could not apply.
  proposeEdit: (
    proposal: { newBody: string; summary: string },
  ) => Promise<{ accepted: boolean; skipped?: readonly SkippedRange[] }>;
  // Lay a body out as its printed pages and describe them (the engine's
  // fastrPageMapText over a paged layout). Absent, there is no pages tool.
  describePages?: (body: string) => string | Promise<string>;
  // The ids of the figures and images the document has. A body that embeds
  // any other id is refused.
  figureIds?: () => readonly string[];
  imageIds?: () => readonly string[];
};

// JSON Schema for a tool's input, as model clients take it.
export type ReportToolInputSchema = {
  type: "object";
  properties: Record<
    string,
    {
      type: "string" | "boolean" | "integer";
      description?: string;
      minimum?: number;
    }
  >;
  required: string[];
  additionalProperties: false;
};

export type ReportTextTool = {
  name: string;
  description: string;
  inputSchema: ReportToolInputSchema;
  // Resolves to the text the model reads: a result, or the reason the call
  // was refused, written so the model can correct it. Rejects only when the
  // host's own functions throw.
  run: (input: unknown) => Promise<string>;
};

// ── Input ────────────────────────────────────────────────────────────────────
// A model's arguments arrive as unchecked JSON. A wrong shape is the model's
// to fix, so it comes back as text like any other refusal.

class InputProblem extends Error {}

type Input = Record<string, unknown>;

function requiredString(input: Input, key: string): string {
  const v = input[key];
  if (typeof v !== "string") {
    throw new InputProblem(`"${key}" is required and must be a string.`);
  }
  return v;
}

function optionalString(input: Input, key: string): string | undefined {
  const v = input[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") {
    throw new InputProblem(`"${key}" must be a string.`);
  }
  return v;
}

function optionalBoolean(input: Input, key: string): boolean | undefined {
  const v = input[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") {
    throw new InputProblem(`"${key}" must be true or false.`);
  }
  return v;
}

function optionalPositiveInt(input: Input, key: string): number | undefined {
  const v = input[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
    throw new InputProblem(`"${key}" must be a whole number, 1 or more.`);
  }
  return v;
}

function defineTool(
  name: string,
  description: string,
  inputSchema: ReportToolInputSchema,
  handler: (input: Input) => string | Promise<string>,
): ReportTextTool {
  return {
    name,
    description,
    inputSchema,
    run: async (input) => {
      try {
        if (typeof input !== "object" || input === null) {
          throw new InputProblem("the input must be an object.");
        }
        return await handler(input as Input);
      } catch (e) {
        if (e instanceof InputProblem) {
          return `Invalid input for ${name}: ${e.message}`;
        }
        throw e;
      }
    },
  };
}

// ── The tools ────────────────────────────────────────────────────────────────

const ALLOW_LITERAL_COLORS = {
  type: "boolean",
  description:
    "Set true ONLY when the user explicitly asked for specific literal colours, gradients or image backgrounds (bg=...). Without it, newly-added literal bg= values are rejected — use tones, which follow the theme.",
} as const;

const OCCURRENCE_INDEX = { type: "integer", minimum: 1 } as const;

const REJECTED_TAIL =
  "nothing was applied. Do not propose it again unless the user asks.";

// The tools for the document the host has open: read it, rewrite it whole,
// rewrite a section, replace a piece of text, and (when the host can lay
// pages out) describe its pages. Every edit goes to the user as a diff.
export function createReportTextTools(
  host: ReportTextToolsHost,
): ReportTextTool[] {
  const embeds = (): ReportEmbedIds => ({
    figures: host.figureIds?.() ?? [],
    images: host.imageIds?.() ?? [],
  });

  // Show a computed edit to the user and report the outcome to the model.
  async function propose(
    edit: ReportTextEdit,
    accepted: string,
    rejected: string,
  ): Promise<string> {
    if (!edit.ok) return edit.error;
    const decision = await host.proposeEdit({
      newBody: edit.newBody,
      summary: edit.summary,
    });
    if (!decision.accepted) return `${rejected} ${REJECTED_TAIL}`;
    return accepted + reportSkippedNote(decision.skipped);
  }

  const describePages = host.describePages;

  const tools: ReportTextTool[] = [
    defineTool(
      "get_report_editor",
      "Get the report's current body (FASTR Markdown), a headings index (each heading's line and the exact section range rewrite_section would replace), and the embedded figure and image ids (live editor state, including unsaved changes). ALWAYS call this first before proposing edits.",
      {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      () =>
        readReportText(host.getBody(), {
          selection: host.getSelection?.(),
          embeds: embeds(),
        }).text,
    ),

    defineTool(
      "rewrite_report",
      `Propose a full rewrite of the report body, written in FASTR Markdown. The user reviews a diff and accepts or rejects — nothing is applied silently. Keep all existing figure/image tokens you want to retain; you may only reference figure/image ids that already exist.

The body MUST be built from the format's \`:::\` blocks — a plain run of headings and paragraphs is rejected unless you pass plain: true, which you do only when the user asked for a plain document. ${
        describePages
          ? "Before proposing, lay the draft out with get_report_pages (pass it as `markdown`) and fix every page it flags. "
          : ""
      }The format:

${FASTR_MD_SYNTAX_DOC}`,
      {
        type: "object",
        properties: {
          body: { type: "string" },
          allowLiteralColors: ALLOW_LITERAL_COLORS,
          plain: {
            type: "boolean",
            description:
              "Set true ONLY when the user explicitly asked for a plain document with none of the format's blocks. Without it, a body that uses no blocks is rejected.",
          },
        },
        required: ["body"],
        additionalProperties: false,
      },
      (input) =>
        propose(
          rewriteReportBody(host.getBody(), {
            body: requiredString(input, "body"),
            allowLiteralColors: optionalBoolean(input, "allowLiteralColors"),
            plain: optionalBoolean(input, "plain"),
          }, embeds()),
          "The user ACCEPTED the rewrite; it is now applied to the report.",
          "The user REJECTED the rewrite;",
        ),
    ),

    defineTool(
      "rewrite_section",
      "Propose rewriting one heading-bounded section. Address by exact heading text; if the heading is not unique, pass occurrenceIndex (1-based). The section is exactly the range get_report_editor's headings index reports for that heading: from the heading line to the next heading of the same or higher level. newBody replaces that WHOLE range, is written in FASTR Markdown and must include the heading. A section reaches for the format's blocks too — a stat row for its numbers, a callout for its caveat, a band for its turning point (the format is in rewrite_report's description). The user reviews a diff.",
      {
        type: "object",
        properties: {
          sectionHeading: { type: "string" },
          newBody: { type: "string" },
          occurrenceIndex: OCCURRENCE_INDEX,
          allowLiteralColors: ALLOW_LITERAL_COLORS,
        },
        required: ["sectionHeading", "newBody"],
        additionalProperties: false,
      },
      (input) => {
        const sectionHeading = requiredString(input, "sectionHeading");
        return propose(
          rewriteReportSection(host.getBody(), {
            sectionHeading,
            newBody: requiredString(input, "newBody"),
            occurrenceIndex: optionalPositiveInt(input, "occurrenceIndex"),
            allowLiteralColors: optionalBoolean(input, "allowLiteralColors"),
          }, embeds()),
          `The user ACCEPTED the rewrite of section "${sectionHeading}"; it is now applied.`,
          `The user REJECTED the rewrite of section "${sectionHeading}";`,
        );
      },
    ),

    defineTool(
      "replace_text",
      "Propose a targeted edit: replace an exact run of text (oldText) with newText. oldText must match the current body VERBATIM (whitespace and markup included) and occur exactly once — if it appears multiple times, pass occurrenceIndex (1-based) or include more surrounding text to make it unique. Use this for small/sentence-level edits, or to act on the user's current selection. Keep any figure/image tokens you intend to retain. The user reviews a diff and accepts or rejects — nothing is applied silently.",
      {
        type: "object",
        properties: {
          oldText: { type: "string" },
          newText: { type: "string" },
          occurrenceIndex: OCCURRENCE_INDEX,
          allowLiteralColors: ALLOW_LITERAL_COLORS,
        },
        required: ["oldText", "newText"],
        additionalProperties: false,
      },
      (input) =>
        propose(
          replaceReportText(host.getBody(), {
            oldText: requiredString(input, "oldText"),
            newText: requiredString(input, "newText"),
            occurrenceIndex: optionalPositiveInt(input, "occurrenceIndex"),
            allowLiteralColors: optionalBoolean(input, "allowLiteralColors"),
          }, embeds()),
          "The user ACCEPTED the edit; it is now applied to the report.",
          "The user REJECTED the edit;",
        ),
    ),
  ];

  if (describePages) {
    tools.push(defineTool(
      "get_report_pages",
      `Lay this FASTR Markdown report out as its printed pages (A4 unless the report says otherwise; the pages the PDF and the editor show) and return the page map: every page's fill, the blocks that landed on it with each one's share of the page, and the problems: a page left short because its next block moved whole to the following page, and a last page that is a stub. Call it with no arguments for the report as it stands (live editor state), or pass \`markdown\` to check a draft BEFORE proposing it (rewrite_report). Fix what it flags with the page budget in the format guide, then check again; a report whose pages are set is the deliverable.`,
      {
        type: "object",
        properties: {
          markdown: {
            type: "string",
            description:
              "A draft body in FASTR Markdown to lay out instead of the current one.",
          },
        },
        required: [],
        additionalProperties: false,
      },
      async (input) => {
        const draft = optionalString(input, "markdown");
        // A draft is laid out as it would land: blank-line runs collapsed.
        return await describePages(
          draft === undefined ? host.getBody() : collapseFastrBlankRuns(draft),
        );
      },
    ));
  }

  return tools;
}
