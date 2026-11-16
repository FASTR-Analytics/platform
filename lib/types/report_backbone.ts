// =============================================================================
// Report backbones: a house style a report is written to. Drafted by the AI
// from an example report (a ministry's bulletin as a PDF or Word file, or a
// FASTR report), reviewed and edited by a person, and kept in the instance's
// report-style library (a style that carries one is a "Report backbone").
//
// A backbone is the example's STYLE and its TYPICAL STRUCTURE, never its
// content: how it looks (theme, colours, page furniture, figure conventions,
// cover), how long and how dense it is, which blocks, templates and charts
// it uses, how it is built (its usual outline) and how it reads (language,
// register). Every field is a setting the platform already has or a number
// the AI's brief and the page checks read; nothing in it is CSS.
//
// The functions over it are in lib/report_backbone.ts.
// =============================================================================

import { z } from "zod";

export const REPORT_BACKBONE_FREQUENCIES = [
  "never",
  "rare",
  "normal",
  "often",
] as const;
export type ReportBackboneFrequency =
  (typeof REPORT_BACKBONE_FREQUENCIES)[number];

// The blocks a backbone says how often to use (FASTR Markdown's own names).
export const REPORT_BACKBONE_WIDGETS = [
  "callout",
  "tiles",
  "stat",
  "columns",
  "quote",
  "band",
  "steps",
  "contents",
  "logos",
  "masthead",
  "signoff",
] as const;
export type ReportBackboneWidget = (typeof REPORT_BACKBONE_WIDGETS)[number];

// A visualization preset's presentation type (presentation_objects.ts).
export const REPORT_BACKBONE_CHART_TYPES = [
  "chart",
  "table",
  "timeseries",
  "map",
  "pie",
] as const;
export type ReportBackboneChartType =
  (typeof REPORT_BACKBONE_CHART_TYPES)[number];

export const REPORT_BACKBONE_COMPARISONS = [
  "none",
  "same_period_last_year",
  "trend",
] as const;

export const REPORT_BACKBONE_REGISTERS = [
  "formal",
  "plain",
  "technical",
] as const;

export const REPORT_BACKBONE_SOURCES = ["pdf", "docx", "report"] as const;
export type ReportBackboneSource = (typeof REPORT_BACKBONE_SOURCES)[number];

// The `:::report` header attributes a backbone may set (FASTR Markdown's
// figure conventions and page furniture). Values are the attribute text.
export const REPORT_BACKBONE_HEADER_ATTRS = [
  "figures",
  "captions",
  "source",
  "numbering",
  "sections",
  "frame",
  "framecolor",
  "footerrule",
  "header",
  "footer",
  "orientation",
] as const;
export type ReportBackboneHeaderAttr =
  (typeof REPORT_BACKBONE_HEADER_ATTRS)[number];

const text = (max: number) => z.string().max(max);
const frequency = z.enum(REPORT_BACKBONE_FREQUENCIES);

export const reportBackboneSchema = z.object({
  version: z.literal(1),
  look: z.object({
    // A FASTR report theme id; checked against the engine's registry where
    // it is used (an unknown one keeps the report's own theme).
    theme: text(40).optional(),
    // `:::report` attributes; `header` and `footer` may hold the tokens
    // {Place} {Period} {Year} {Issue}, filled for each report.
    report: z.partialRecord(
      z.enum(REPORT_BACKBONE_HEADER_ATTRS),
      text(200),
    ).optional(),
  }),
  cover: z.object({
    layout: text(20).optional(),
    tone: text(20).optional(),
    fill: z.boolean().optional(),
    kicker: text(200).optional(),
    sub: text(200).optional(),
    issue: text(80).optional(),
    date: text(80).optional(),
    // The ministry lines of a masthead, word for word.
    masthead: z.array(text(200)).max(6).optional(),
    // How many logos the cover carries; the logos are always the user's.
    logoSlots: z.number().int().min(0).max(4).optional(),
  }).optional(),
  signoff: z.object({
    // "Prepared by", "Approved by": labels only, names are never invented.
    labels: z.array(text(60)).max(3),
  }).optional(),
  length: z.object({
    pagesMin: z.number().int().min(1).max(200).optional(),
    pagesMax: z.number().int().min(1).max(200).optional(),
    wordsPerPage: z.number().int().min(20).max(1000).optional(),
    wordsPerFigure: z.number().int().min(0).max(600).optional(),
    // The least a page (not the last) may be filled, 0 to 1: a bulletin
    // whose pages hold one chart and a short analysis sits low.
    minPageFill: z.number().min(0.1).max(0.9).optional(),
  }).optional(),
  structure: z.object({
    outline: z.array(z.object({
      role: text(80),
      purpose: text(300),
      repeat: z.boolean().optional(),
    })).max(30).optional(),
    numberedSections: z.boolean().optional(),
    headingDepth: z.number().int().min(1).max(3).optional(),
    // The words that open the paragraph after each figure ("Analyse :").
    figureLeadIn: text(40).optional(),
    oneFigurePerSection: z.boolean().optional(),
  }).optional(),
  templates: z.object({
    use: frequency.optional(),
    layouts: z.array(text(30)).max(15).optional(),
  }).optional(),
  widgets: z.partialRecord(z.enum(REPORT_BACKBONE_WIDGETS), frequency)
    .optional(),
  charts: z.object({
    preferred: z.array(z.enum(REPORT_BACKBONE_CHART_TYPES)).max(5).optional(),
    // In words: "by health facility", "by district".
    breakdown: text(120).optional(),
    comparison: z.enum(REPORT_BACKBONE_COMPARISONS).optional(),
    // What the example draws that the platform cannot (a target line, bars
    // and a line on a second axis), in words.
    approximated: z.array(text(120)).max(10).optional(),
  }).optional(),
  voice: z.object({
    language: text(10).optional(),
    register: z.enum(REPORT_BACKBONE_REGISTERS).optional(),
    notes: text(3000).optional(),
  }).optional(),
});
export type ReportBackbone = z.infer<typeof reportBackboneSchema>;

export const EMPTY_REPORT_BACKBONE: ReportBackbone = { version: 1, look: {} };
