// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type Accessor, createSignal, type JSX } from "solid-js";
import {
  ConfirmDeleteForm,
  openAlert,
  openComponent,
  type StateHolder,
} from "./deps.ts";
import type { StateHolderButtonAction, StateHolderFormAction } from "./deps.ts";
import type { APIResponseNoData, APIResponseWithData } from "./types.ts";

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
  state: Accessor<StateHolder<T>>;
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
  const [state, setter] = createSignal<StateHolder<T>>({
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

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//   ______               __      __                            _______               __      __                          //
//  /      \             /  |    /  |                          /       \             /  |    /  |                         //
// /$$$$$$  |  _______  _$$ |_   $$/   ______   _______        $$$$$$$  | __    __  _$$ |_  _$$ |_     ______   _______   //
// $$ |__$$ | /       |/ $$   |  /  | /      \ /       \       $$ |__$$ |/  |  /  |/ $$   |/ $$   |   /      \ /       \  //
// $$    $$ |/$$$$$$$/ $$$$$$/   $$ |/$$$$$$  |$$$$$$$  |      $$    $$< $$ |  $$ |$$$$$$/ $$$$$$/   /$$$$$$  |$$$$$$$  | //
// $$$$$$$$ |$$ |        $$ | __ $$ |$$ |  $$ |$$ |  $$ |      $$$$$$$  |$$ |  $$ |  $$ | __ $$ | __ $$ |  $$ |$$ |  $$ | //
// $$ |  $$ |$$ \_____   $$ |/  |$$ |$$ \__$$ |$$ |  $$ |      $$ |__$$ |$$ \__$$ |  $$ |/  |$$ |/  |$$ \__$$ |$$ |  $$ | //
// $$ |  $$ |$$       |  $$  $$/ $$ |$$    $$/ $$ |  $$ |      $$    $$/ $$    $$/   $$  $$/ $$  $$/ $$    $$/ $$ |  $$ | //
// $$/   $$/  $$$$$$$/    $$$$/  $$/  $$$$$$/  $$/   $$/       $$$$$$$/   $$$$$$/     $$$$/   $$$$/   $$$$$$/  $$/   $$/  //
//                                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export type TimActionButton<U extends any[]> = {
  state: Accessor<StateHolderButtonAction>;
  click: (...args: U) => Promise<void>;
};

// Overload 1: Action returns data
export function timActionButton<T, U extends any[]>(
  actionFunc: (...args: U) => Promise<APIResponseWithData<T>>,
  ...onSuccessCallbacks: Array<(data: T) => void | Promise<void>>
): TimActionButton<U>;

// Overload 2: Action returns no data
export function timActionButton<U extends any[]>(
  actionFunc: (...args: U) => Promise<APIResponseNoData>,
  ...onSuccessCallbacks: Array<() => void | Promise<void>>
): TimActionButton<U>;

/**
 * Creates a button action that executes an action and shows alerts on error.
 *
 * Race condition protection: If click() is called multiple times before previous
 * actions complete, only the most recent action will update state and execute callbacks.
 */
export function timActionButton<T, U extends any[]>(
  actionFunc: (
    ...args: U
  ) => Promise<APIResponseWithData<T> | APIResponseNoData>,
  ...onSuccessCallbacks: Array<
    ((data: T) => void | Promise<void>) | (() => void | Promise<void>)
  >
): TimActionButton<U> {
  const [state, setter] = createSignal<StateHolderButtonAction>({
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
        setter({ status: "ready" });
        await openAlert({ title: "Error", text: res.err, intent: "danger" });
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
          setter({ status: "ready" });
          await openAlert({
            title: "Error",
            text: err instanceof Error ? err.message : String(err),
            intent: "danger",
          });
          return;
        }
      }

      if (thisRequestId !== requestId) return;

      setter({ status: "ready" });
    } catch (err) {
      if (thisRequestId !== requestId) return;
      setter({ status: "ready" });
      await openAlert({
        title: "Error",
        text: err instanceof Error ? err.message : String(err),
        intent: "danger",
      });
    }
  }

  return { state, click };
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
  state: Accessor<StateHolderFormAction>;
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
  const [state, setter] = createSignal<StateHolderFormAction>({
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

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//   ______               __      __                            _______             __              __                //
//  /      \             /  |    /  |                          /       \           /  |            /  |               //
// /$$$$$$  |  _______  _$$ |_   $$/   ______   _______        $$$$$$$  |  ______  $$ |  ______   _$$ |_     ______   //
// $$ |__$$ | /       |/ $$   |  /  | /      \ /       \       $$ |  $$ | /      \ $$ | /      \ / $$   |   /      \  //
// $$    $$ |/$$$$$$$/ $$$$$$/   $$ |/$$$$$$  |$$$$$$$  |      $$ |  $$ |/$$$$$$  |$$ |/$$$$$$  |$$$$$$/   /$$$$$$  | //
// $$$$$$$$ |$$ |        $$ | __ $$ |$$ |  $$ |$$ |  $$ |      $$ |  $$ |$$    $$ |$$ |$$    $$ |  $$ | __ $$    $$ | //
// $$ |  $$ |$$ \_____   $$ |/  |$$ |$$ \__$$ |$$ |  $$ |      $$ |__$$ |$$$$$$$$/ $$ |$$$$$$$$/   $$ |/  |$$$$$$$$/  //
// $$ |  $$ |$$       |  $$  $$/ $$ |$$    $$/ $$ |  $$ |      $$    $$/ $$       |$$ |$$       |  $$  $$/ $$       | //
// $$/   $$/  $$$$$$$/    $$$$/  $$/  $$$$$$/  $$/   $$/       $$$$$$$/   $$$$$$$/ $$/  $$$$$$$/    $$$$/   $$$$$$$/  //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export type TimActionDelete<U extends any[]> = {
  click: (...args: U) => Promise<void>;
};

export function timActionDelete<U extends any[]>(
  confirmText: string | JSX.Element | { text: string; itemList: string[] },
  actionFunc: (
    ...args: U
  ) => Promise<APIResponseWithData<any> | APIResponseNoData>,
  ...onSuccessCallbacks: Array<() => void | Promise<void>>
): TimActionDelete<U> {
  async function click(...args: U) {
    const isObjectWithItemList = typeof confirmText === "object" &&
      confirmText !== null &&
      "text" in confirmText &&
      "itemList" in confirmText;

    await openComponent({
      element: ConfirmDeleteForm,
      props: {
        text: isObjectWithItemList
          ? (confirmText as { text: string; itemList: string[] }).text
          : (confirmText as string | JSX.Element),
        itemList: isObjectWithItemList
          ? (confirmText as { text: string; itemList: string[] }).itemList
          : undefined,
        actionFunc: () => actionFunc(...args),
        onSuccessCallbacks: onSuccessCallbacks.length > 0
          ? onSuccessCallbacks
          : undefined,
      },
    });
  }

  return { click };
}
