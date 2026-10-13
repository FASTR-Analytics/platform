export { figureInputsForDownload, loadImageEntry } from "./_report_export_maps";
export { unavailableItemMarkdown } from "./_media_placeholder";
export {
  applyInkTheme,
  createFigureRasterCache,
  createFigureSizeCache,
  figureRasterKey,
} from "./report_figure_raster";
export type {
  FigureRasterCache,
  FigureSizeCache,
} from "./report_figure_raster";
// The document builder and the ink a figure takes are Report Forge's; they
// are re-exported here so the app's figure code keeps one import.
export {
  figureDarkInkForColors,
  figureLightInkForColors,
  GENERIC_DARK_INK,
  GENERIC_LIGHT_INK,
} from "report-forge";
export type { FigureInkTheme } from "report-forge";
export {
  buildReportBodyNodes,
  FASTR_THEME_STYLE_ATTR,
  interceptReportLinks,
  isDarkGroundBehind,
  materializeReportBackgrounds,
  materializeReportEmbeds,
  measureFigureGrounds,
  renderReportBodyHtml,
  REPORT_BASE_CSS,
  sanitizeReportHtml,
  stripLazyLoading,
  TRANSPARENT_PIXEL_SRC,
  wrapReportDocument,
} from "report-forge";
export type { FigureRasterState } from "report-forge";
