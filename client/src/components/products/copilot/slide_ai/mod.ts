export { buildConfigFromPreset } from "./build_config_from_preset.ts";
export { convertAiInputToSlide } from "./convert_ai_input_to_slide.ts";
export { simplifySlideForAI } from "./simplify_slide_for_ai.ts";
export type { SimplifiedSlide } from "./simplify_slide_for_ai.ts";
export { getDeckSummaryForAI } from "./get_deck_summary.ts";
export { getSlideWithUpdatedBlocks } from "./get_slide_with_updated_blocks.ts";
export { buildLayoutFromSpec, normalizeSpans } from "./layout_spec_helpers.ts";
export {
  describeSlideBlocks,
  extractBlocksFromLayout,
  layoutNodeToStructure,
} from "./layout_structure.ts";
export type {
  BlockWithId,
  LayoutStructure,
  LayoutStructureCell,
} from "./layout_structure.ts";
export { measureSlideOverflow } from "./measure_slide_overflow.ts";
export { resolveFigureFromMetric } from "./resolve_figure_from_metric.ts";
