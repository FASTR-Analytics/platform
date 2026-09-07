// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    CLERK UI (SolidJS, browser)                                             //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////
//
// The browser half of the Clerk identity seam: sign-in gate, Bearer
// getHeaders, signOut, and the reactive signed-in user. The clerk-js vendor
// coupling lives here and nowhere else.

export { createClerkAuthClient } from "./clerk_auth_client.tsx";
export type { ClerkAuthClient, ClerkUiUser } from "./clerk_auth_client.tsx";
