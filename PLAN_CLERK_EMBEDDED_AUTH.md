# Plan: Switch to Embedded Clerk Auth Components

## Motivation

Clerk's hosted Account Portal pages (sign-in/sign-up) are English-only. Language is controlled by Clerk's dashboard, with no URL parameter support. Switching to embedded components means the `localization: frFR` we already pass to `clerk.load()` will apply to the auth UI, giving French instances a fully French experience.

## Prerequisites

- **Clerk dashboard config**: Some Clerk setups require enabling "embedded mode" or disabling "Account Portal redirect" in the dashboard. Verify this before implementing.

## Current Flow

1. `LoggedInWrapper` loads Clerk, checks `clerk.user`
2. If not logged in → renders `ClerkNewLogin`
3. `ClerkNewLogin` fetches `instanceMeta`, renders two `<Button href=...>` links to Clerk's hosted pages (`VITE_CLERK_SIGN_IN_FLOW`, `VITE_CLERK_SIGN_UP_FLOW`) with `?redirect_url=...`
4. User leaves the SPA, authenticates on Clerk's domain, gets redirected back
5. On return, `clerk.load()` picks up session, `clerk.user` becomes truthy

## New Flow

1. `LoggedInWrapper` loads Clerk (unchanged)
2. If not logged in → renders `ClerkNewLogin`
3. `ClerkNewLogin` renders a `<div ref>` and calls `clerk.mountSignIn(el, { withSignUp: true })` — single embedded component handles sign-in, sign-up, forgot password, and toggle links between them
4. User authenticates in-place — no navigation, no redirect
5. `clerk.addListener()` detects auth state change → updates a SolidJS signal → `<Show>` re-evaluates → app renders

## Changes

### `client/src/components/LoggedInWrapper.tsx`

**Reactivity bridge (critical):**
- `clerk.user` is a plain property, not a SolidJS signal. With embedded auth, the user signs in without a page reload, so SolidJS won't know to re-evaluate `<Show when={clerk.user}>`.
- Add a signal driven by `clerk.addListener()`:
  ```ts
  const [clerkUser, setClerkUser] = createSignal(clerk.user);
  clerk.addListener((e) => setClerkUser(e.user ?? undefined));
  ```
- Replace `<Show when={bypassAuth || clerk.user}>` with `<Show when={bypassAuth || clerkUser()}>`.
- The listener must be registered after `clerk.load()` resolves.

**Embedded sign-in (single component):**
- Replace `ClerkNewLogin` internals: remove `<Button href=...>` links, replace with a container `<div>` that mounts Clerk's embedded sign-in component.
- Use SolidJS `ref` to get the DOM element, call `clerk.mountSignIn(el, { withSignUp: true })`.
- `withSignUp: true` makes the component handle sign-in, sign-up, forgot password, and the toggle links between them — no separate `mountSignUp` needed.
- `onCleanup` → `clerk.unmountSignIn()`.

**Cleanup:**
- Remove `clerkSignInFlow` and `clerkSignUpFlow` const declarations (lines 11-12).
- `instanceMeta` fetch is still needed for instance name display (and for first-time language detection).
- `instanceRedirectUrl` is no longer used in this component.
- Keep the existing layout (centered, logo, instance name) around the embedded component.

### `INSTANCE_REDIRECT_URL` removal

After this change, `INSTANCE_REDIRECT_URL` serves no functional purpose. Keeping dead config that the server throws on if missing will confuse future developers.

- **`server/exposed_env_vars.ts`** — remove `_INSTANCE_REDIRECT_URL` (or make it optional with a default/empty string)
- **`server/routes/instance/instance.ts`** — remove from `getInstanceMeta` response
- **`lib/types/instance.ts`** — remove `instanceRedirectUrl` from `InstanceMeta`
- **`instance_meta_form.tsx`** — remove the redirect URL display row
- **`.env` / `.env.example`** (server-side) — remove the variable
- **Deployed instances** — document that this env var is no longer required

### `client/.env.example`

- Remove `VITE_CLERK_SIGN_IN_FLOW` and `VITE_CLERK_SIGN_UP_FLOW` lines

### `client/.env.development.local` and `client/.env.production.local`

- Remove the same two lines (these are gitignored, so just a note for deployed instances)

### No changes needed

- **Server middleware** — session management is cookie-based, works identically
- **`try_catch_server.ts`**, **`profile.tsx`**, **`project_settings.tsx`** — `clerk.signOut()`, `clerk.openUserProfile()`, `clerk.session?.getToken()` all unchanged

## Considerations

- **OAuth flows** (Google etc.) still redirect to the provider and back. Clerk handles this automatically with embedded components — return URL defaults to the current page.
- **Multi-step flows** (MFA, email verification) are handled in-place by the embedded component using hash routing. No SolidJS router integration needed.
- **`bypassAuth` mode** — unaffected; the `ClerkNewLogin` component only renders when `bypassAuth` is false and `clerkUser()` is falsy.
- **Reversible** — can always add hosted page links back if needed.
