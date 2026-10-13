// Report Forge: a paginated FASTR Markdown report editor.
//
//   import { ... } from "report-forge";          the engine and the editor
//   import "report-forge/styles.css";            the editor chrome's styles
//
// The engine alone (no browser framework) is "report-forge/engine".

export * from "./engine/mod.ts";
export * from "./ui/kit/mod.ts";
export * from "./ui/toolbar_primitives.tsx";
export * from "./ui/collab.ts";
export * from "./ui/figure_ink.ts";
export * from "./ui/report_html.ts";
export * from "./ui/editor/embed_resolver.ts";
export * from "./ui/editor/rebase_edits.ts";
export * from "./ui/editor/fastr_block_labels.ts";
export * from "./ui/paginator.ts";
export * from "./ui/exports/standalone_html.ts";
export * from "./ui/exports/paged_pdf.ts";
export * from "./ui/exports/word.ts";
export * from "./ui/exports/save.ts";
export { inlineThemeFontCss } from "./ui/exports/inline_theme_fonts.ts";
export { loadThemeFontsForWord } from "./ui/exports/word_theme_fonts.ts";
export {
  EDITOR_COLUMN_MAX_REM,
  type ReportBlockContext,
  ReportBodyEditor,
  type ReportEditorApi,
  type ReportEditorSelection,
  type ReportPageLayoutOut,
} from "./ui/editor/body_editor.tsx";
export {
  type EditorPagination,
  FM_LIVE_SCOPE_CLASS,
  type PageBoxGeometry,
} from "./ui/editor/live_preview_extension.tsx";
