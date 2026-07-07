// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { BETA_HEADERS } from "../deps.ts";

////////////////////////////////////////////////////////////////////////////////
// BETA HEADER HELPERS
////////////////////////////////////////////////////////////////////////////////

export type BetaHeaderConfig = {
  // True only when the request carries the basic web_fetch_20250910 tool
  // (pre-4.6 models); the _20260209 web tools are GA and need no beta.
  hasBasicWebFetch?: boolean;
  hasDocuments?: boolean;
};

export const ANTHROPIC_BETA_HEADER = "anthropic-beta";

export function getBetaHeaders(
  config: BetaHeaderConfig,
): Record<typeof ANTHROPIC_BETA_HEADER, string> | undefined {
  const headers: string[] = [];

  if (config.hasBasicWebFetch) {
    headers.push(BETA_HEADERS.WEB_FETCH);
  }

  if (config.hasDocuments) {
    headers.push(BETA_HEADERS.FILES_API);
  }

  if (headers.length === 0) {
    return undefined;
  }

  return {
    [ANTHROPIC_BETA_HEADER]: headers.join(","),
  };
}

export function hasWebFetchTool(
  builtInTools?: { webFetch?: boolean | object },
): boolean {
  return Boolean(builtInTools?.webFetch);
}
