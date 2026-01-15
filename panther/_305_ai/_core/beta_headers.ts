// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

////////////////////////////////////////////////////////////////////////////////
// BETA HEADER CONSTANTS
////////////////////////////////////////////////////////////////////////////////

export const BETA_HEADERS = {
  WEB_FETCH: "web-fetch-2025-09-10",
  STRUCTURED_OUTPUTS: "structured-outputs-2025-11-13",
  INTERLEAVED_THINKING: "interleaved-thinking-2025-05-14",
  FILES_API: "files-api-2025-04-14",
} as const;

////////////////////////////////////////////////////////////////////////////////
// BETA HEADER HELPERS
////////////////////////////////////////////////////////////////////////////////

export type BetaHeaderConfig = {
  hasTools?: boolean;
  hasWebFetch?: boolean;
  interleavedThinking?: boolean;
  hasDocuments?: boolean;
};

export function getBetaHeaders(
  config: BetaHeaderConfig,
): Record<string, string> | undefined {
  const headers: string[] = [];

  // Always include structured outputs when tools are present (strict mode)
  if (config.hasTools) {
    headers.push(BETA_HEADERS.STRUCTURED_OUTPUTS);
  }

  // Web fetch requires its own beta header
  if (config.hasWebFetch) {
    headers.push(BETA_HEADERS.WEB_FETCH);
  }

  // Interleaved thinking (thinking between tool calls)
  if (config.interleavedThinking) {
    headers.push(BETA_HEADERS.INTERLEAVED_THINKING);
  }

  // Files API for document uploads
  if (config.hasDocuments) {
    headers.push(BETA_HEADERS.FILES_API);
  }

  if (headers.length === 0) {
    return undefined;
  }

  return {
    "anthropic-beta": headers.join(","),
  };
}

export function hasWebFetchTool(
  builtInTools?: { webFetch?: boolean | object },
): boolean {
  return Boolean(builtInTools?.webFetch);
}
