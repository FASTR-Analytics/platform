// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

////////////////////////
//                    //
//    Core modules    //
//                    //
////////////////////////

export * from "./_000_consts/mod.ts";
export * from "./_000_utils/mod.ts";
export * from "./_001_color/mod.ts";
export * from "./_001_font/mod.ts";
export * from "./_001_geometry/mod.ts";
export * from "./_001_render_system/mod.ts";
export * from "./_002_canvas/mod.ts";
export * from "./_002_pattern/mod.ts";
export * from "./_003_figure_style/mod.ts";
export * from "./_004_markdown_style/mod.ts";
export * from "./_005_page_style/mod.ts";
export * from "./_006_page_presets/mod.ts";
export * from "./_006_style/mod.ts";
export * from "./_007_figure_core/mod.ts";
export * from "./_008_layouter/mod.ts";
export * from "./_009_vizgraph/mod.ts";
export * from "./_010_chartoh/mod.ts";
export * from "./_010_chartov/mod.ts";
export * from "./_010_maps/mod.ts";
export * from "./_010_sankey/mod.ts";
export * from "./_010_sankey_explicit/mod.ts";
export * from "./_010_simpleviz/mod.ts";
export * from "./_010_table/mod.ts";
export * from "./_010_timeseries/mod.ts";
export * from "./_010_vizgraph_figure/mod.ts";
export * from "./_011_figure_renderer/mod.ts";
export * from "./_011_uncertainty_client/mod.ts";
export * from "./_012_image_renderer/mod.ts";
export * from "./_013_docs_core/mod.ts";
export * from "./_100_csv/mod.ts";
export * from "./_101_csv_query/mod.ts";
export * from "./_105_markdown/mod.ts";
export * from "./_106_markdown_to_word/mod.ts";
// _110_ai_types: CURATED re-export (Phase 3 review, bucket 3). Model
// consts/capabilities and message/config types are package-public; the
// engine logic (turn_logic, view_logic, request_shaping — wire rendering,
// digest reduction, cache shaping) is internal to the vendored engine and
// deliberately NOT re-exported, so its formats can evolve without consumer
// breakage. Add a symbol here only when a consumer should see it.
export {
  BETA_HEADERS,
  BUILTIN_TOOL_TYPES,
  DEFAULT_PRICING,
  getMaxOutputTokens,
  getSupportedEffortLevels,
  MAX_OUTPUT_TOKENS,
  MODEL_MAX_OUTPUT_TOKENS,
  MODEL_OPTIONS,
  MODEL_PRICING,
  RETIRED_MODEL_IDS,
  SERVER_TOOL_LABELS,
  supportsAdaptiveThinking,
  supportsDisabledThinking,
  supportsDynamicWebTools,
  supportsManualThinking,
  supportsSamplingParams,
} from "./_110_ai_types/mod.ts";
export type {
  AnthropicModel,
  AnthropicModelConfig,
  CacheControl,
  ContentBlock,
  DocumentContentBlock,
  DocumentSource,
  EffortLevel,
  EphemeralSection,
  MessageParam,
  MessagePayload,
  MessageRole,
  ModelPricing,
  OutputConfig,
  RedactedThinkingBlock,
  ThinkingBlock,
  ThinkingConfig,
  ToolDefinition,
  Usage,
} from "./_110_ai_types/mod.ts";
export * from "./_111_api_contract/mod.ts";
export * from "./_121_page/mod.ts";
export * from "./_122_pdf/mod.ts";
export * from "./_122_pptx/mod.ts";
export * from "./_150_figure_schema/mod.ts";

//////////////////////
//                  //
//    UI modules    //
//                  //
//////////////////////

export * from "./_301_util_funcs/mod.ts";
export * from "./_302_query/mod.ts";
export * from "./_303_components/mod.ts";
export * from "./_304_actions/mod.ts";
export * from "./_305_ai/mod.ts";
export * from "./_306_text_editor/mod.ts";
export * from "./_307_vizgraph_view/mod.ts";

/////////////////////
//                 //
//    Protocols    //
//                 //
/////////////////////

// @protocol README.md
// @protocol PROTOCOL_ALL_TYPESCRIPT.md
// @protocol PROTOCOL_ALL_STRUCTURE.md
// @protocol PROTOCOL_ALL_SIZING.md
// @protocol PROTOCOL_ALL_TRANSLATION.md
// @protocol PROTOCOL_UI_SOLIDJS.md
// @protocol PROTOCOL_UI_STATE.md
// @protocol PROTOCOL_UI_STYLING.md
// @protocol PROTOCOL_UI_COMPONENTS.md
// @protocol PROTOCOL_UI_STRUCTURE.md
// @protocol PROTOCOL_UI_AI_CHAT.md
