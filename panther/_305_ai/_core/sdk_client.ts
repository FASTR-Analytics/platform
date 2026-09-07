// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Anthropic } from "../deps.ts";

export type SDKClientConfig = {
  baseURL: string;
  apiKey?: string;
  defaultHeaders?: Record<string, string>;
  // Per-request headers, resolved fresh on every request — for credentials
  // a static defaultHeaders cannot carry (a session JWT rotates, so a value
  // captured at construction goes stale). These win over defaultHeaders on
  // conflict. Absent → behavior unchanged.
  getHeaders?: () =>
    | Promise<Record<string, string>>
    | Record<string, string>;
};

export function createSDKClient(config: SDKClientConfig): Anthropic {
  const getHeaders = config.getHeaders;
  return new Anthropic({
    // API key placeholder - backend will use real key
    apiKey: config.apiKey || "not-needed",
    // Point to your backend proxy
    baseURL: config.baseURL,
    // Optional custom headers
    defaultHeaders: config.defaultHeaders,
    ...(getHeaders === undefined ? {} : {
      fetch: async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const headers = new Headers(init?.headers);
        for (const [key, value] of Object.entries(await getHeaders())) {
          headers.set(key, value);
        }
        return await fetch(input, { ...init, headers });
      },
    }),
    // Safe when using a proxy - no real API key exposed to browser
    dangerouslyAllowBrowser: true,
  });
}
