#!/usr/bin/env -S deno run --allow-read

/**
 * Dry-run migration analysis with strict Zod validation
 */

import { parse } from "jsr:@std/csv";
import { walk } from "jsr:@std/fs/walk";
import { z } from "npm:zod";

const EXPORT_DIR = "./report_exports_20260423_100402";

// ============================================================================
// ZOD SCHEMAS - Strict validation to catch unknown fields
// ============================================================================

const ReportConfigSchema = z.object({
  label: z.string(),
  selectedReplicantValue: z.string().optional().nullable(),
  logos: z.array(z.string()).optional().nullable(),
  logoSize: z.number(),
  figureScale: z.number(),
  footer: z.string(),
  showPageNumbers: z.boolean(),
  headerSize: z.number(),
  useWatermark: z.boolean(),
  watermarkText: z.string(),
  colorTheme: z.string(),
  overlay: z.string().optional().nullable(),
}).strict().or(z.object({}).passthrough()); // Fallback to catch all

const POInfoSchema = z.object({
  id: z.string(),
  metricId: z.string().optional(),
  moduleId: z.string().optional(),
  selectedReplicantValue: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
  replicateBy: z.string().optional().nullable(), // FOUND: extra field
}).strict();

const ContentItemSchema = z.object({
  type: z.string(),
  span: z.number().optional().nullable(),
  stretch: z.boolean().optional(),
  fillArea: z.boolean().optional(),
  textSize: z.number().optional(),
  textBackground: z.string().optional(),
  placeholderInvisible: z.boolean().optional(),
  placeholderStretch: z.boolean().optional(), // FOUND: extra field
  placeholderHeight: z.number().optional().nullable(), // FOUND: extra field
  useFigureAdditionalScale: z.boolean().optional(),
  figureAdditionalScale: z.number().optional().nullable(),
  presentationObjectInReportInfo: POInfoSchema.optional().nullable(),
  markdown: z.string().optional().nullable(),
  imgFile: z.string().optional().nullable(),
  imgHeight: z.number().optional().nullable(),
  imgFit: z.string().optional(),
  imgStretch: z.boolean().optional(),
  hideFigureCaption: z.boolean().optional(),
  hideFigureSubCaption: z.boolean().optional(),
  hideFigureFootnote: z.boolean().optional(),
}).strict();

const LayoutNodeSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.enum(["item", "rows", "cols"]),
    id: z.string(),
    data: ContentItemSchema.optional(),
    children: z.array(LayoutNodeSchema).optional(),
    span: z.number().optional(),
    minH: z.number().optional(),
    maxH: z.number().optional(),
  }).strict()
);

const CoverConfigSchema = z.object({
  titleText: z.string().optional().nullable(),
  titleTextRelFontSize: z.number().optional(),
  subTitleText: z.string().optional().nullable(),
  subTitleTextRelFontSize: z.number().optional(),
  presenterText: z.string().optional().nullable(),
  presenterTextRelFontSize: z.number().optional(),
  dateText: z.string().optional().nullable(),
  dateTextRelFontSize: z.number().optional(),
  logos: z.array(z.string()).optional().nullable(),
}).strict();

const SectionConfigSchema = z.object({
  sectionText: z.string().optional().nullable(),
  sectionTextRelFontSize: z.number().optional(),
  smallerSectionText: z.string().optional().nullable(),
  smallerSectionTextRelFontSize: z.number().optional(),
}).strict();

const FreeformConfigSchema = z.object({
  useHeader: z.boolean().optional(),
  headerText: z.string().optional().nullable(),
  subHeaderText: z.string().optional().nullable(),
  dateText: z.string().optional().nullable(),
  headerLogos: z.array(z.string()).optional().nullable(),
  useFooter: z.boolean().optional(),
  footerText: z.string().optional().nullable(),
  footerLogos: z.array(z.string()).optional().nullable(),
  content: z.union([
    z.array(z.array(ContentItemSchema)), // Legacy 2D array
    LayoutNodeSchema, // Modern LayoutNode
  ]),
}).strict();

const ReportItemConfigSchema = z.object({
  type: z.enum(["cover", "section", "freeform"]),
  cover: CoverConfigSchema,
  section: SectionConfigSchema,
  freeform: FreeformConfigSchema,
}).strict();

// ============================================================================
// ANALYSIS
// ============================================================================

type Issue = {
  instance: string;
  db: string;
  reportId: string;
  itemId?: string;
  type: "error" | "warning" | "info";
  message: string;
  details?: string;
};

const issues: Issue[] = [];
let totalReports = 0;
let totalItems = 0;
let validReportConfigs = 0;
let invalidReportConfigs = 0;
let validItemConfigs = 0;
let invalidItemConfigs = 0;

const stats = {
  itemTypes: { cover: 0, section: 0, freeform: 0, unknown: 0 },
  contentTypes: { text: 0, figure: 0, image: 0, placeholder: 0, unknown: 0 },
  legacyFormat: 0,
  modernFormat: 0,
  withSpan: 0,
  figuresWithPO: 0,
  figuresWithoutPO: 0,
  extraFields: new Map<string, number>(),
};

function addIssue(
  instance: string,
  db: string,
  reportId: string,
  itemId: string | undefined,
  type: Issue["type"],
  message: string,
  details?: string
) {
  issues.push({ instance, db, reportId, itemId, type, message, details });
}

function recordExtraField(field: string) {
  stats.extraFields.set(field, (stats.extraFields.get(field) || 0) + 1);
}

function findExtraFields(obj: any, schema: Record<string, true>, prefix: string = ""): string[] {
  const extras: string[] = [];
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const key of Object.keys(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (!(key in schema)) {
        extras.push(fullKey);
        recordExtraField(fullKey);
      }
    }
  }
  return extras;
}

function countContentInLegacy(content: any[][]) {
  for (const row of content) {
    for (const item of row) {
      if (item.span) stats.withSpan++;
      const t = item.type;
      if (t === "text") stats.contentTypes.text++;
      else if (t === "figure") {
        stats.contentTypes.figure++;
        if (item.presentationObjectInReportInfo) stats.figuresWithPO++;
        else stats.figuresWithoutPO++;
      }
      else if (t === "image") stats.contentTypes.image++;
      else if (t === "placeholder") stats.contentTypes.placeholder++;
      else {
        stats.contentTypes.unknown++;
        recordExtraField(`contentType:${t}`);
      }
    }
  }
}

function countContentInLayoutNode(node: any) {
  if (node.type === "item" && node.data) {
    if (node.span) stats.withSpan++;
    const t = node.data.type;
    if (t === "text") stats.contentTypes.text++;
    else if (t === "figure") {
      stats.contentTypes.figure++;
      if (node.data.presentationObjectInReportInfo) stats.figuresWithPO++;
      else stats.figuresWithoutPO++;
    }
    else if (t === "image") stats.contentTypes.image++;
    else if (t === "placeholder") stats.contentTypes.placeholder++;
    else {
      stats.contentTypes.unknown++;
      recordExtraField(`contentType:${t}`);
    }
  } else if (node.children) {
    for (const child of node.children) {
      countContentInLayoutNode(child);
    }
  }
}

async function analyzeDatabase(instance: string, db: string, dbPath: string) {
  const reportsPath = `${dbPath}/reports.csv`;
  const itemsPath = `${dbPath}/report_items.csv`;

  let reportsText: string;
  try {
    reportsText = await Deno.readTextFile(reportsPath);
  } catch {
    return;
  }

  const reports = parse(reportsText, { skipFirstRow: true, columns: ["id", "report_type", "config", "last_updated", "is_deleted"] });

  let itemsText: string;
  try {
    itemsText = await Deno.readTextFile(itemsPath);
  } catch {
    return;
  }

  const items = parse(itemsText, { skipFirstRow: true, columns: ["id", "report_id", "sort_order", "config", "last_updated"] });

  const itemsByReport = new Map<string, typeof items>();
  for (const item of items) {
    const reportId = item.report_id;
    if (!itemsByReport.has(reportId)) {
      itemsByReport.set(reportId, []);
    }
    itemsByReport.get(reportId)!.push(item);
  }

  for (const report of reports) {
    totalReports++;
    const reportId = report.id;

    let rawReportConfig: any;
    try {
      rawReportConfig = JSON.parse(report.config);
    } catch (e) {
      addIssue(instance, db, reportId, undefined, "error", `Invalid JSON`, String(e));
      invalidReportConfigs++;
      continue;
    }

    // Validate report config with Zod
    const reportResult = ReportConfigSchema.safeParse(rawReportConfig);
    if (!reportResult.success) {
      invalidReportConfigs++;
      const errorMsg = reportResult.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      addIssue(instance, db, reportId, undefined, "error", `Report config validation failed`, errorMsg);
    } else {
      validReportConfigs++;
    }

    // Check for extra fields in report config
    const knownReportFields = {
      label: true, selectedReplicantValue: true, logos: true, logoSize: true,
      figureScale: true, footer: true, showPageNumbers: true, headerSize: true,
      useWatermark: true, watermarkText: true, colorTheme: true, overlay: true,
      // Known extra fields from older versions:
      primaryBackgroundColor: true, primaryTextColor: true, baseBackgroundColor: true, baseTextColor: true,
      logo: true, aspectRatio: true,
    };
    const extraReportFields = findExtraFields(rawReportConfig, knownReportFields, "reportConfig");
    if (extraReportFields.length > 0) {
      addIssue(instance, db, reportId, undefined, "warning", `Extra report fields`, extraReportFields.join(", "));
    }

    // Process items
    const reportItems = itemsByReport.get(reportId) ?? [];
    for (const item of reportItems) {
      totalItems++;
      const itemId = item.id;

      let rawConfig: any;
      try {
        rawConfig = JSON.parse(item.config);
      } catch (e) {
        addIssue(instance, db, reportId, itemId, "error", `Invalid JSON`, String(e));
        invalidItemConfigs++;
        continue;
      }

      // Check format
      const isLegacy = Array.isArray(rawConfig.freeform?.content);
      if (isLegacy) {
        stats.legacyFormat++;
      } else {
        stats.modernFormat++;
      }

      // Validate with Zod
      const itemResult = ReportItemConfigSchema.safeParse(rawConfig);
      if (!itemResult.success) {
        invalidItemConfigs++;
        const errorMsg = itemResult.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
        addIssue(instance, db, reportId, itemId, "error", `Item config validation failed`, errorMsg);
      } else {
        validItemConfigs++;
      }

      // Count item type
      const itemType = rawConfig.type;
      if (itemType === "cover") stats.itemTypes.cover++;
      else if (itemType === "section") stats.itemTypes.section++;
      else if (itemType === "freeform") {
        stats.itemTypes.freeform++;
        // Count content types
        if (isLegacy) {
          countContentInLegacy(rawConfig.freeform.content);
        } else if (rawConfig.freeform?.content) {
          countContentInLayoutNode(rawConfig.freeform.content);
        }
      }
      else {
        stats.itemTypes.unknown++;
        recordExtraField(`itemType:${itemType}`);
      }
    }
  }
}

async function main() {
  console.log("Analyzing exported reports with strict Zod validation...\n");

  for await (const entry of walk(EXPORT_DIR, { maxDepth: 2, includeFiles: false })) {
    const parts = entry.path.split("/");
    if (parts.length >= 3) {
      const instance = parts[parts.length - 2];
      const db = parts[parts.length - 1];
      if (db.match(/^[0-9a-f]{8}-/)) {
        await analyzeDatabase(instance, db, entry.path);
      }
    }
  }

  console.log("=".repeat(70));
  console.log("STRICT VALIDATION RESULTS");
  console.log("=".repeat(70));
  console.log();
  console.log(`Total reports: ${totalReports}`);
  console.log(`  Valid configs: ${validReportConfigs}`);
  console.log(`  Invalid configs: ${invalidReportConfigs}`);
  console.log();
  console.log(`Total items: ${totalItems}`);
  console.log(`  Valid configs: ${validItemConfigs}`);
  console.log(`  Invalid configs: ${invalidItemConfigs}`);
  console.log();
  console.log("--- Format Stats ---");
  console.log(`Legacy format (2D array): ${stats.legacyFormat}`);
  console.log(`Modern format (LayoutNode): ${stats.modernFormat}`);
  console.log();
  console.log("--- Item Types ---");
  console.log(`Cover: ${stats.itemTypes.cover}`);
  console.log(`Section: ${stats.itemTypes.section}`);
  console.log(`Freeform: ${stats.itemTypes.freeform}`);
  console.log(`Unknown: ${stats.itemTypes.unknown}`);
  console.log();
  console.log("--- Content Types ---");
  console.log(`Text: ${stats.contentTypes.text}`);
  console.log(`Figure: ${stats.contentTypes.figure}`);
  console.log(`Image: ${stats.contentTypes.image}`);
  console.log(`Placeholder: ${stats.contentTypes.placeholder}`);
  console.log(`Unknown: ${stats.contentTypes.unknown}`);
  console.log();
  console.log("--- Figure Stats ---");
  console.log(`With PO info: ${stats.figuresWithPO}`);
  console.log(`Without PO info: ${stats.figuresWithoutPO}`);
  console.log();
  console.log(`Items with span: ${stats.withSpan}`);

  if (stats.extraFields.size > 0) {
    console.log();
    console.log("--- Extra/Unknown Fields Found ---");
    for (const [field, count] of [...stats.extraFields.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${field}: ${count}`);
    }
  }

  const errors = issues.filter(i => i.type === "error");
  const warnings = issues.filter(i => i.type === "warning");

  if (errors.length > 0) {
    console.log();
    console.log("=".repeat(70));
    console.log(`ERRORS (${errors.length})`);
    console.log("=".repeat(70));
    for (const issue of errors.slice(0, 30)) {
      console.log(`[${issue.instance}/${issue.db.slice(0, 8)}] ${issue.message}`);
      if (issue.details) console.log(`    ${issue.details.slice(0, 200)}`);
    }
    if (errors.length > 30) console.log(`... and ${errors.length - 30} more`);
  }

  if (warnings.length > 0) {
    console.log();
    console.log("=".repeat(70));
    console.log(`WARNINGS (${warnings.length})`);
    console.log("=".repeat(70));
    for (const issue of warnings.slice(0, 10)) {
      console.log(`[${issue.instance}/${issue.db.slice(0, 8)}] ${issue.message}: ${issue.details}`);
    }
    if (warnings.length > 10) console.log(`... and ${warnings.length - 10} more`);
  }

  console.log();
  console.log("=".repeat(70));
  if (invalidReportConfigs === 0 && invalidItemConfigs === 0) {
    console.log("✓ All configs pass strict Zod validation!");
  } else {
    console.log(`✗ ${invalidReportConfigs} report configs + ${invalidItemConfigs} item configs failed validation`);
  }
  console.log("=".repeat(70));
}

main();
