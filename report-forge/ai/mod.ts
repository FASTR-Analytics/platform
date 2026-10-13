// Report Forge for an assistant: the text operations a tool-calling model
// performs on the open document, and those operations as ready-made tools.
// No browser framework and no model client: it runs in the browser and in
// Deno, under whatever tool layer the host has.
//
//   import { createReportTextTools } from "report-forge/ai";
//
// The brief that teaches a model the format is the engine's
// FASTR_MD_SYNTAX_DOC ("report-forge/engine").

export * from "./operations.ts";
export * from "./tools.ts";
export * from "./validators.ts";
