// The AI tools BOTH surfaces expose (the SPA copilot and the /mcp endpoint)
// over one package-bound env (env.ts), and the chat's catalogue as data
// (copilot_catalogue.ts), here so the server tests pin it. The SPA-only HFA
// formatters live here too, so the server tests pin them. Other SPA-only
// tools and their formatters live in client/src/components/instance/copilot/
// tools/ (module internals) and client/src/components/products/copilot/
// ai_tools/ (the product tools).
export * from "./env.ts";
export * from "./copilot_catalogue.ts";
export * from "./build_system_prompt.ts";
export * from "./reference_catalog.ts";
export * from "./source_header.ts";
export * from "./content_validators.ts";
export * from "./format_hfa_indicators_for_ai.ts";
export * from "./format_metric_data_for_ai.ts";
export * from "./format_metrics_list_for_ai.ts";
export * from "./format_products_list_for_ai.ts";
export * from "./hfa_time_points_for_ai.ts";
export * from "./tools_metrics.ts";
export * from "./tools_reference_docs.ts";
