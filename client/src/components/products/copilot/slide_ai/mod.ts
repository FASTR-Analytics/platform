export { buildConfigFromPreset } from "./build_config_from_preset.ts";
export { convertAiInputToSlide } from "./convert_ai_input_to_slide.ts";
export { extractBlocksFromLayout, simplifySlideForAI } from "./extract_blocks_from_layout.ts";
export type { BlockWithId, SimplifiedSlide } from "./extract_blocks_from_layout.ts";
export { getDeckSummaryForAI } from "./get_deck_summary.ts";
export { getSlideWithUpdatedBlocks } from "./get_slide_with_updated_blocks.ts";
export { buildLayoutFromSpec, layoutNodeToStructure, normalizeSpans } from "./layout_spec_helpers.ts";
export type { LayoutStructure, LayoutStructureCell } from "./layout_spec_helpers.ts";
export { resolveFigureFromMetric } from "./resolve_figure_from_metric.ts";
