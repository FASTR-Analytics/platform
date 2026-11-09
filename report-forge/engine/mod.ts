// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// The Report Forge engine: everything that reads, edits, lays out and exports
// a document without a browser framework. Pure TypeScript: it runs in the
// browser and in Deno.
//
// The inline-string helper (`t3`) is deliberately not exported from here: it
// is the package's own (./i18n.ts), and a host has its own under the same
// name. A host sets the language through setReportForgeLanguage.

export * from "./embeds.ts";
export * from "./fastr_live_regions.ts";
export * from "./fastr_markdown_blocks.ts";
export * from "./fastr_markdown_edits.ts";
export * from "./fastr_markdown_pages.ts";
export * from "./fastr_markdown_spec.ts";
export * from "./fastr_page_template_edits.ts";
export * from "./fastr_page_templates.ts";
export * from "./fastr_paragraph_align.ts";
export * from "./fastr_report_page_map.ts";
export * from "./line_ranges.ts";
export * from "./report_document_shell.ts";
export * from "./report_fastr_css.ts";
export * from "./report_fastr_markdown.ts";
export * from "./report_fastr_paged.ts";
export * from "./report_fastr_template_css.ts";
export * from "./report_fastr_themes.ts";
export * from "./report_fastr_word.ts";
export * from "./report_sections.ts";
export {
  getReportForgeLanguage,
  REPORT_FORGE_LANGUAGES,
  type ReportForgeLanguage,
  type ReportForgeText,
  setReportForgeLanguage,
} from "./i18n.ts";
