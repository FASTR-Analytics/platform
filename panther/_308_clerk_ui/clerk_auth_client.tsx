// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The browser half of the Clerk identity seam (graduated from the panterra
// lab): clerk-js load, the sign-in gate, and the Bearer credential every
// request carries. The vendor coupling is quarantined in this one module —
// app code consumes AuthGate/getHeaders/signOut/user and never touches
// clerk-js. The app keeps its ONE auth-mode branch (dev switcher vs Clerk):
// identity vocabulary and construction are the app's; this module only
// presents the verified Clerk session.
//
// getHeaders presents the session JWT as a Bearer header — clerk-js caches
// the short-lived token and refreshes it when stale, so there is no
// freshness machinery here. The server side judges it with _115's session
// provider; the pair resolves the same person to the same identityKey.

import { Clerk, createSignal, Match, onMount, Show, Switch } from "./deps.ts";
import type { JSX } from "./deps.ts";

// clerk-js exports no resource types; the signed-in user's shape is derived
// from the Clerk instance itself.
type UserResource = NonNullable<InstanceType<typeof Clerk>["user"]>;

export type ClerkUiUser = {
  id: string;
  // The primary address, or null for an account without one. A user who
  // never set a name is a legitimate account state; the app decides the
  // fallback for both.
  email: string | null;
  fullName: string | null;
};

export type ClerkAuthClient = {
  // Gates the app on a signed-in user: loads clerk-js, then children for a
  // signed-in user or the mounted sign-in card for anyone else.
  AuthGate: (p: { children: JSX.Element }) => JSX.Element;
  // The credential every request carries, injected via the op client's
  // getHeaders seam (and any off-contract call site).
  getHeaders: () => Promise<Record<string, string>>;
  signOut: () => Promise<void>;
  // Reactive: null until loaded/signed in.
  user: () => ClerkUiUser | null;
};

function mapUser(user: UserResource | null | undefined): ClerkUiUser | null {
  if (user === null || user === undefined) {
    return null;
  }
  return {
    id: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
    fullName: user.fullName,
  };
}

export function createClerkAuthClient(
  config: { publishableKey: string },
): ClerkAuthClient {
  const clerk = config.publishableKey ? new Clerk(config.publishableKey) : null;
  const [user, setUser] = createSignal<ClerkUiUser | null>(null);

  async function getHeaders(): Promise<Record<string, string>> {
    const token = await clerk?.session?.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function signOut(): Promise<void> {
    await clerk?.signOut();
  }

  function SignInCard() {
    let el!: HTMLDivElement;
    onMount(() => {
      clerk?.mountSignIn(el);
    });
    return (
      <div class="flex h-full items-center justify-center">
        <div ref={el} />
      </div>
    );
  }

  function AuthGate(p: { children: JSX.Element }) {
    const [loaded, setLoaded] = createSignal(false);
    onMount(async () => {
      if (clerk === null) {
        return;
      }
      await clerk.load();
      setUser(mapUser(clerk.user));
      clerk.addListener((e) => setUser(mapUser(e.user)));
      setLoaded(true);
    });
    return (
      <Switch>
        <Match when={clerk === null}>
          <p class="ui-pad text-danger text-sm">
            createClerkAuthClient requires a publishableKey
          </p>
        </Match>
        <Match when={loaded()}>
          <Show when={user()} fallback={<SignInCard />}>
            {p.children}
          </Show>
        </Match>
      </Switch>
    );
  }

  return { AuthGate, getHeaders, signOut, user };
}
