// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Anthropic } from "../deps.ts";

export interface SDKClientConfig {
  baseURL: string;

  apiKey?: string;

  defaultHeaders?: Record<string, string>;
}

export function createSDKClient(config: SDKClientConfig): Anthropic {
  return new Anthropic({
    // API key placeholder - backend will use real key
    apiKey: config.apiKey || "not-needed",
    // Point to your backend proxy
    baseURL: config.baseURL,
    // Optional custom headers
    defaultHeaders: config.defaultHeaders,
  });
}
