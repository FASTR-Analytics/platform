// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  clerkFrontendApiUrl,
  createClerkOAuthProvider,
  createClerkSessionProvider,
  isBadOAuthCredentialReason,
  isBadSessionCredentialReason,
} from "./clerk_identity.ts";
export type {
  ClerkOAuthProviderConfig,
  ClerkOAuthUser,
  ClerkSessionProviderConfig,
} from "./clerk_identity.ts";
export { createOAuthDiscoveryHandler } from "./oauth_discovery.ts";
export type {
  OAuthDiscoveryConfig,
  OAuthDiscoveryHandler,
} from "./oauth_discovery.ts";
