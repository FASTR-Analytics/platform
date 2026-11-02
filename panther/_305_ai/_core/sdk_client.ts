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

// Without a key the client authenticates through its proxy (a session in
// getHeaders or defaultHeaders, or a cookie), so it must never pick up a
// credential of the machine it runs on: the SDK would otherwise resolve one
// from its config files and environment.
class ProxiedAnthropic extends Anthropic {
  protected override _shouldResolveDefaultCredentials(): boolean {
    return false;
  }
}

export function createSDKClient(config: SDKClientConfig): Anthropic {
  const getHeaders = config.getHeaders;
  const apiKey = config.apiKey || null;
  return new ProxiedAnthropic({
    apiKey,
    // A null keeps ANTHROPIC_AUTH_TOKEN unread.
    authToken: null,
    baseURL: config.baseURL,
    // A null Authorization tells the SDK no credential is intended, where a
    // placeholder key would reach the proxy's guard as a bogus bearer token.
    defaultHeaders: apiKey === null
      ? { Authorization: null, ...config.defaultHeaders }
      : config.defaultHeaders,
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
