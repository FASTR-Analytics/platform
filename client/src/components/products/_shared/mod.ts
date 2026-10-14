export {
  createIdGeneratorForLayout,
  generateUniqueBlockId,
} from "./id_generation.ts";
export { DuplicateProductsModal } from "./duplicate_products_modal.tsx";
export {
  generalLabel,
  moveToRootLabel,
  topLevelLabel,
} from "./folder_labels.ts";
export {
  buildProductTree,
  childFolders,
  descendantIds,
  dropParent,
  dropRegion,
  folderDragItem,
  folderPathOptions,
  GENERAL_ID,
  productTreeRows,
  targetRowIndex,
} from "./folder_tree.ts";
export type {
  DragItem,
  DropRegion,
  DropTarget,
  ProductTreeRow,
} from "./folder_tree.ts";
export { PackageScopeChip } from "./package_scope_chip.tsx";
export { PackageScopeModal } from "./package_scope_modal.tsx";
export {
  manageAccessLabel,
  ProductAccessModal,
} from "./product_access_modal.tsx";
export { ProductSettings } from "./product_settings.tsx";
export { ProductTitle } from "./product_title.tsx";
export { ReportHtmlPreview } from "./report_html_preview.tsx";
export { ReportFigureEmbed } from "./report_figure_embed.tsx";
export type { FigureStaleContext } from "./report_figure_embed.tsx";
export {
  divSurface,
  iframeSurface,
  isSurfaceAtBottom,
  lineToPreviewTop,
  previewTopToLine,
  scrollSurfaceToBottom,
} from "./scroll_sync.ts";
export type {
  PreviewAnchor,
  PreviewSurface,
  PreviewSurfaceEvent,
} from "./scroll_sync.ts";
export { InsertFigureModal } from "./insert_figure/mod.ts";
export type { InsertFigureResult } from "./insert_figure/mod.ts";
