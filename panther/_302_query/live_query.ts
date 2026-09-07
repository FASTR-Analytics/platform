// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type Accessor, createSignal, onCleanup } from "solid-js";
import {
  type APIResponseWithData,
  getQueryStateFromApiResponse,
  isDeepEqual,
  type QueryState,
} from "./deps.ts";

// A poke, never a payload: the subscription delivers "op <name> committed"
// and the live query silently re-runs its own (guarded) read. Structural
// type so this module needs no ops-layer import — _114's
// OpEventsConnection satisfies it.
export type LiveQuerySubscription = {
  listen: (listener: {
    onEvent?: (event: { name: string }) => void;
    onConnect?: () => void;
  }) => () => void;
};

export type LiveQuery<T> = {
  state: Accessor<QueryState<T>>;
  refetch: () => Promise<void>;
};

/**
 * Live read of op-backed server state (PROTOCOL_UI_STATE): fetches on
 * creation, then silently refetches on every matching poke and on every
 * (re)connect — the reconnect refetch covers pokes missed while
 * disconnected AND the initial fetch-vs-subscribe race, so there is no
 * missed-change window. Loading state appears on the first fetch only;
 * afterwards stale data stays visible until fresh data lands
 * (stale-while-revalidate). A refetch that returns structurally identical
 * data notifies no subscriber: content-identical results keep the previous
 * state object (isDeepEqual), so the signal never fires.
 *
 * Refetches are serialized: a poke landing mid-fetch queues exactly one
 * follow-up run, so out-of-order completion is structurally impossible
 * (the request-id guard stays as a backstop for future edits). Awaiting
 * `refetch()` resolves after the run that serves it completes.
 *
 * Reactive reads inside `queryFunc` are NOT tracked — pokes and reconnects
 * re-run the thunk, but input changes (an id, a filter) do not. A view
 * whose inputs change must remount (keyed) or use `createEffect` per
 * PROTOCOL_UI_STATE rule 4; live queries target long-lived views, which
 * amplifies the trap.
 *
 * A failed silent refetch replaces visible data with error state (no
 * stale-on-error); the reconnect refetch self-heals transient failures.
 * Known limit: pokes are not debounced — every poke arriving between
 * fetches costs one fetch.
 *
 * `ops` filters pokes by op name; omit it to refetch on every event the
 * subscription delivers. Call inside a component (or createRoot) — cleanup
 * unlistens via onCleanup.
 */
export function createLiveQuery<T>(
  queryFunc: () => Promise<APIResponseWithData<T>>,
  subscription: LiveQuerySubscription,
  opts?: { ops?: readonly string[]; loadingMsg?: string },
): LiveQuery<T> {
  const [state, setState] = createSignal<QueryState<T>>(loadingState());

  // Structural suppression: a refetch that returns content-identical data
  // (the reconnect refetch, a poke that changed nothing this query reads)
  // keeps the PREVIOUS state object, so the signal never fires and no
  // downstream memo or effect re-runs (e.g. a full canvas relayout) for no
  // change. Done here rather than via the signal's `equals` option because
  // solid's server build ignores `equals` — this way the reference-stability
  // contract holds in every build.
  function commit(next: QueryState<T>): void {
    setState((prev) => isDeepEqual(prev, next) ? prev : next);
  }

  let requestId = 0;
  let inFlight: Promise<void> | undefined;
  let queued: Promise<void> | undefined;

  function loadingState(): QueryState<T> {
    return opts?.loadingMsg !== undefined
      ? { status: "loading", msg: opts.loadingMsg }
      : { status: "loading" };
  }

  async function execute(silent: boolean): Promise<void> {
    const thisRequestId = ++requestId;
    if (!silent) {
      commit(loadingState());
    }
    try {
      const res = await queryFunc();
      if (thisRequestId === requestId) {
        commit(getQueryStateFromApiResponse(res));
      }
    } catch (err) {
      if (thisRequestId === requestId) {
        commit({
          status: "error",
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  function run(silent: boolean): Promise<void> {
    if (inFlight !== undefined) {
      queued ??= inFlight.then(() => {
        queued = undefined;
        return run(true);
      });
      return queued;
    }
    inFlight = execute(silent).finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  }

  if (typeof window !== "undefined") {
    const unlisten = subscription.listen({
      onEvent: (event) => {
        if (opts?.ops === undefined || opts.ops.includes(event.name)) {
          void run(true);
        }
      },
      onConnect: () => {
        void run(true);
      },
    });
    onCleanup(unlisten);

    void run(false);
  }

  return {
    state,
    refetch: () => run(true),
  };
}
