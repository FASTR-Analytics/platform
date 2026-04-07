// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { BETA_HEADERS } from "../deps.ts";

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

  if (config.hasTools) {
    headers.push(BETA_HEADERS.STRUCTURED_OUTPUTS);
  }

  if (config.hasWebFetch) {
    headers.push(BETA_HEADERS.WEB_FETCH);
  }

  if (config.interleavedThinking) {
    headers.push(BETA_HEADERS.INTERLEAVED_THINKING);
  }

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
