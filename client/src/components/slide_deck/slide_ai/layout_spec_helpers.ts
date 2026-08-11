// The layout-spec helpers live in lib/ai_tools (shared with the headless MCP
// host). This shim keeps the historical import path working.
export {
  buildLayoutFromSpec,
  layoutNodeToStructure,
  type LayoutStructure,
  type LayoutStructureCell,
  normalizeSpans,
} from "lib";
