// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type Accessor, createSignal } from "solid-js";
import type { APIResponseNoData, APIResponseWithData } from "./types.ts";

export type QueryState<T> =
  | { status: "loading"; msg?: string }
  | { status: "error"; err: string }
  | { status: "ready"; data: T };

export type FormActionState =
  | { status: "loading" }
  | { status: "error"; err: string }
  | { status: "ready" };

export type ButtonActionState =
  | { status: "loading" }
  | { status: "ready" };

//////////////////////////////////////////////////////////////////////////////////////////
//  ________  __                       ______                                           //
// /        |/  |                     /      \                                          //
// $$$$$$$$/ $$/  _____  ____        /$$$$$$  | __    __   ______    ______   __    __  //
//    $$ |   /  |/     \/    \       $$ |  $$ |/  |  /  | /      \  /      \ /  |  /  | //
//    $$ |   $$ |$$$$$$ $$$$  |      $$ |  $$ |$$ |  $$ |/$$$$$$  |/$$$$$$  |$$ |  $$ | //
//    $$ |   $$ |$$ | $$ | $$ |      $$ |_ $$ |$$ |  $$ |$$    $$ |$$ |  $$/ $$ |  $$ | //
//    $$ |   $$ |$$ | $$ | $$ |      $$ / \$$ |$$ \__$$ |$$$$$$$$/ $$ |      $$ \__$$ | //
//    $$ |   $$ |$$ | $$ | $$ |      $$ $$ $$< $$    $$/ $$       |$$ |      $$    $$ | //
//    $$/    $$/ $$/  $$/  $$/        $$$$$$  | $$$$$$/   $$$$$$$/ $$/        $$$$$$$ | //
//                                        $$$/                               /  \__$$ | //
//                                                                           $$    $$/  //
//                                                                            $$$$$$/   //
//                                                                                      //
//////////////////////////////////////////////////////////////////////////////////////////

export type TimQuery<T> = {
  state: Accessor<QueryState<T>>;
  fetch: () => Promise<void>;
  silentFetch: () => Promise<void>;
};

/**
 * Creates a query that fetches data and manages loading/error/ready states.
 *
 * Race condition protection: If multiple fetch() or silentFetch() calls are made
 * before previous requests complete, only the most recent request will update state.
 * Stale responses are ignored to prevent data corruption.
 */
export function timQuery<T>(
  queryFunc: () => Promise<APIResponseWithData<T>>,
  loadingMsg?: string,
): TimQuery<T> {
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

      if (res.success === false) {
        setter({ status: "error", err: res.err });
        return;
      }
      setter({ status: "ready", data: res.data });
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

      if (res.success === false) {
        setter({ status: "error", err: res.err });
        return;
      }
      setter({ status: "ready", data: res.data });
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

export type TimActionForm<U extends any[]> = {
  state: Accessor<FormActionState>;
  click: (...args: U) => Promise<void>;
};

// Overload 1: Action returns data
export function timActionForm<T, U extends any[]>(
  actionFunc: (...args: U) => Promise<APIResponseWithData<T>>,
  ...onSuccessCallbacks: Array<(data: T) => void | Promise<void>>
): TimActionForm<U>;

// Overload 2: Action returns no data
export function timActionForm<U extends any[]>(
  actionFunc: (...args: U) => Promise<APIResponseNoData>,
  ...onSuccessCallbacks: Array<() => void | Promise<void>>
): TimActionForm<U>;

/**
 * Creates a form action that executes an action and shows inline errors.
 *
 * Race condition protection: If click() is called multiple times before previous
 * actions complete, only the most recent action will update state and execute callbacks.
 */
export function timActionForm<T, U extends any[]>(
  actionFunc: (
    ...args: U
  ) => Promise<APIResponseWithData<T> | APIResponseNoData>,
  ...onSuccessCallbacks: Array<
    ((data: T) => void | Promise<void>) | (() => void | Promise<void>)
  >
): TimActionForm<U> {
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
