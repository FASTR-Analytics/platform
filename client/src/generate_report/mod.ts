export { buildReportFigureMap, buildReportImageMap, figureInputsForDownload, loadImageEntry } from "./_report_export_maps";
export { replaceUnavailableMediaTokens, unavailableItemMarkdown } from "./_media_placeholder";
export { applyInkTheme, createFigureRasterCache, createFigureSizeCache, figureDarkInkForColors, figureInkThemeForStyle, figureRasterKey, GENERIC_DARK_INK, GENERIC_LIGHT_INK } from "./report_figure_raster";
export type { FigureInkTheme, FigureRasterCache, FigureSizeCache } from "./report_figure_raster";
export { buildReportBodyNodes, FASTR_THEME_STYLE_ATTR, interceptReportLinks, REPORT_BASE_CSS, wrapReportDocument, isDarkGroundBehind, materializeReportBackgrounds, materializeReportEmbeds, measureFigureGrounds, renderReportBodyHtml, sanitizeReportHtml, stripLazyLoading, TRANSPARENT_PIXEL_SRC } from "./report_html";
export type { FigureRasterState } from "./report_html";
export { REPORT_MARKDOWN_STYLE } from "./report_markdown_style";
