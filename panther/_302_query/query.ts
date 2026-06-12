// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type Accessor, createSignal } from "solid-js";
import {
  type APIResponseNoData,
  type APIResponseWithData,
  type FormActionState,
  getQueryStateFromApiResponse,
  type QueryState,
} from "./types.ts";

export type Query<T> = {
  state: Accessor<QueryState<T>>;
  fetch: () => Promise<void>;
  silentFetch: () => Promise<void>;
};

/**
 * One-shot query: queryFunc runs ONCE on mount. There is no key — reactive
 * reads inside queryFunc are NOT tracked, and the query does not re-run when
 * inputs change. For views that must react to changing inputs or server
 * updates, use createEffect + createSignal<StateHolder<T>> instead. See
 * PROTOCOL_UI_STATE.md.
 *
 * Use fetch()/silentFetch() to manually re-run. If you find yourself calling
 * these to "refresh after a mutation", the view is long-lived enough that it
 * should be using createEffect watching a version signal.
 *
 * Race condition protection: if multiple fetch()/silentFetch() calls overlap,
 * only the most recent updates state.
 */
export function createQuery<T>(
  queryFunc: () => Promise<APIResponseWithData<T>>,
  loadingMsg?: string,
): Query<T> {
  const [state, setter] = createSignal<QueryState<T>>({
    status: "loading",
  });

  let requestId = 0;

  async function fetch() {
    const thisRequestId = ++requestId;

    setter(
      loadingMsg
        ? { status: "loading", msg: loadingMsg }
        : { status: "loading" },
    );

    try {
      const res = await queryFunc();
      if (thisRequestId !== requestId) return;
      setter(getQueryStateFromApiResponse(res));
    } catch (err) {
      if (thisRequestId !== requestId) return;
      setter({
        status: "error",
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function silentFetch() {
    const thisRequestId = ++requestId;

    try {
      const res = await queryFunc();
      if (thisRequestId !== requestId) return;
      setter(getQueryStateFromApiResponse(res));
    } catch (err) {
      if (thisRequestId !== requestId) return;
      setter({
        status: "error",
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (typeof window !== "undefined") {
    fetch();
  }

  return {
    state,
    fetch,
    silentFetch,
  };
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////
//   ______               __      __                            ________                                 //
//  /      \             /  |    /  |                          /        |                                //
// /$$$$$$  |  _______  _$$ |_   $$/   ______   _______        $$$$$$$$/______    ______   _____  ____   //
// $$ |__$$ | /       |/ $$   |  /  | /      \ /       \       $$ |__  /      \  /      \ /     \/    \  //
// $$    $$ |/$$$$$$$/ $$$$$$/   $$ |/$$$$$$  |$$$$$$$  |      $$    |/$$$$$$  |/$$$$$$  |$$$$$$ $$$$  | //
// $$$$$$$$ |$$ |        $$ | __ $$ |$$ |  $$ |$$ |  $$ |      $$$$$/ $$ |  $$ |$$ |  $$/ $$ | $$ | $$ | //
// $$ |  $$ |$$ \_____   $$ |/  |$$ |$$ \__$$ |$$ |  $$ |      $$ |   $$ \__$$ |$$ |      $$ | $$ | $$ | //
// $$ |  $$ |$$       |  $$  $$/ $$ |$$    $$/ $$ |  $$ |      $$ |   $$    $$/ $$ |      $$ | $$ | $$ | //
// $$/   $$/  $$$$$$$/    $$$$/  $$/  $$$$$$/  $$/   $$/       $$/     $$$$$$/  $$/       $$/  $$/  $$/  //
//                                                                                                       //
///////////////////////////////////////////////////////////////////////////////////////////////////////////

export type FormAction<U extends any[]> = {
  state: Accessor<FormActionState>;
  click: (...args: U) => Promise<void>;
};

// Overload 1: Action returns data
export function createFormAction<T, U extends any[]>(
  actionFunc: (...args: U) => Promise<APIResponseWithData<T>>,
  ...onSuccessCallbacks: Array<(data: T) => void | Promise<void>>
): FormAction<U>;

// Overload 2: Action returns no data
export function createFormAction<U extends any[]>(
  actionFunc: (...args: U) => Promise<APIResponseNoData>,
  ...onSuccessCallbacks: Array<() => void | Promise<void>>
): FormAction<U>;

/**
 * Creates a form action that executes an action and shows inline errors.
 *
 * Race condition protection: If click() is called multiple times before previous
 * actions complete, only the most recent action will update state and execute callbacks.
 */
export function createFormAction<T, U extends any[]>(
  actionFunc: (
    ...args: U
  ) => Promise<APIResponseWithData<T> | APIResponseNoData>,
  ...onSuccessCallbacks: Array<
    ((data: T) => void | Promise<void>) | (() => void | Promise<void>)
  >
): FormAction<U> {
  const [state, setter] = createSignal<FormActionState>({
    status: "ready",
  });

  let requestId = 0;

  async function click(...args: U) {
    const thisRequestId = ++requestId;

    setter({ status: "loading" });

    try {
      const res = await actionFunc(...args);

      if (thisRequestId !== requestId) return;

      if (res.success === false) {
        setter({ status: "error", err: res.err });
        return;
      }

      const responseData = res as { success: true; data?: T };
      const hasData = "data" in responseData && responseData.data !== undefined;

      // Execute all callbacks sequentially
      for (const callback of onSuccessCallbacks) {
        try {
          if (hasData) {
            await (callback as (data: T) => void | Promise<void>)(
              responseData.data!,
            );
          } else {
            await (callback as () => void | Promise<void>)();
          }
        } catch (err) {
          if (thisRequestId !== requestId) return;
          setter({
            status: "error",
            err: err instanceof Error ? err.message : String(err),
          });
          return;
        }
      }

      if (thisRequestId !== requestId) return;

      setter({ status: "ready" });
    } catch (err) {
      if (thisRequestId !== requestId) return;
      setter({
        status: "error",
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { state, click };
}
