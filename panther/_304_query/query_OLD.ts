// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// import { Accessor, JSX, Setter, createSignal } from "solid-js";
// import {
//   ConfirmForm,
//   StateHolder,
//   StateHolderButtonAction,
//   StateHolderFormAction,
//   openAlert,
//   openComponent,
// } from "../_components/mod";
// import { APIResponseNoData, APIResponseWithData } from "./types.ts";

// ////////////////////////////////////////////////////////////////////
// //  ________  __                       ______   _______   ______  //
// // /        |/  |                     /      \ /       \ /      | //
// // $$$$$$$$/ $$/  _____  ____        /$$$$$$  |$$$$$$$  |$$$$$$/  //
// //    $$ |   /  |/     \/    \       $$ |__$$ |$$ |__$$ |  $$ |   //
// //    $$ |   $$ |$$$$$$ $$$$  |      $$    $$ |$$    $$/   $$ |   //
// //    $$ |   $$ |$$ | $$ | $$ |      $$$$$$$$ |$$$$$$$/    $$ |   //
// //    $$ |   $$ |$$ | $$ | $$ |      $$ |  $$ |$$ |       _$$ |_  //
// //    $$ |   $$ |$$ | $$ | $$ |      $$ |  $$ |$$ |      / $$   | //
// //    $$/    $$/ $$/  $$/  $$/       $$/   $$/ $$/       $$$$$$/  //
// //                                                                //
// ////////////////////////////////////////////////////////////////////

// /////////////////////////
// //                     //
// //    Action button    //
// //                     //
// /////////////////////////

// export type TimActionButton<U extends any[]> = {
//   state: Accessor<StateHolderButtonAction>;
//   click: (...args: U) => Promise<void>;
// };

// export function timActionButton<T, U extends any[]>(
//   actionFunc: (
//     ...args: U
//   ) => Promise<APIResponseWithData<T> | APIResponseNoData>,
//   onSuccessFunc?: (data: T | undefined) => void | Promise<void>,
// ): TimActionButton<U> {
//   const [state, setterActionButton] = createSignal<StateHolderButtonAction>({
//     status: "ready",
//   });
//   async function click(...args: U) {
//     await stateHolderButtonAction(
//       setterActionButton,
//       () => actionFunc(...args),
//       onSuccessFunc,
//     );
//   }
//   return { state, click };
// }

// export function timActionButtonSilentFetch<T, U extends any[]>(
//   actionFunc: (
//     ...args: U
//   ) => Promise<APIResponseWithData<T> | APIResponseNoData>,
//   silentFetch: ((...args: U) => Promise<void>) | (() => Promise<void>),
//   onSuccessFunc?: (data: T | undefined) => void | Promise<void>,
// ): TimActionButton<U> {
//   const [state, setterActionButton] = createSignal<StateHolderButtonAction>({
//     status: "ready",
//   });
//   async function click(...args: U) {
//     await stateHolderButtonActionSilentFetch(
//       setterActionButton,
//       () => actionFunc(...args),
//       () => silentFetch(...args),
//       onSuccessFunc,
//     );
//   }
//   return { state, click };
// }

// ///////////////////////
// //                   //
// //    Action form    //
// //                   //
// ///////////////////////

// export type TimActionForm<U extends any[]> = {
//   state: Accessor<StateHolderFormAction>;
//   click: (...args: U) => Promise<void>;
// };

// export function timActionForm<T, U extends any[]>(
//   actionFunc: (
//     ...args: U
//   ) => Promise<APIResponseWithData<T> | APIResponseNoData>,
//   onSuccessFunc?: (data: T | undefined) => void | Promise<void>,
// ): TimActionForm<U> {
//   const [state, setterActionForm] = createSignal<StateHolderFormAction>({
//     status: "ready",
//   });
//   async function click(...args: U) {
//     await stateHolderFormAction(
//       setterActionForm,
//       () => actionFunc(...args),
//       onSuccessFunc,
//     );
//   }
//   return { state, click };
// }

// export function timActionFormSilentFetch<T, U extends any[]>(
//   actionFunc: (
//     ...args: U
//   ) => Promise<APIResponseWithData<T> | APIResponseNoData>,
//   silentFetch: () => Promise<void>,
//   onSuccessFunc?: (data: T | undefined) => void | Promise<void>,
// ): TimActionForm<U> {
//   const [state, setterActionForm] = createSignal<StateHolderFormAction>({
//     status: "ready",
//   });
//   async function click(...args: U) {
//     await stateHolderFormActionSilentFetch(
//       setterActionForm,
//       () => actionFunc(...args),
//       silentFetch,
//       onSuccessFunc,
//     );
//   }
//   return { state, click };
// }

// /////////////////////
// //                 //
// //   Action Delete //
// //                 //
// /////////////////////

// export type TimActionDelete<U extends any[]> = {
//   click: (...args: U) => Promise<void>;
// };

// export function timActionDelete<T, U extends any[]>(
//   confirmText: string | JSX.Element | { text: string; itemList: string[] },
//   actionFunc: (
//     ...args: U
//   ) => Promise<APIResponseWithData<T> | APIResponseNoData>,
//   onSuccessFunc?: (data: T | undefined) => void | Promise<void>,
//   french?: boolean,
// ): TimActionDelete<U> {
//   async function click(...args: U) {
//     const res = await openComponent({
//       element: ConfirmForm,
//       props:
//         typeof confirmText === "object" && "itemList" in confirmText
//           ? {
//               text: confirmText.text,
//               itemList: confirmText.itemList,
//               actionFunc: () => actionFunc(...args),
//               french,
//             }
//           : {
//               text: confirmText,
//               actionFunc: () => actionFunc(...args),
//               french,
//             },
//     });

//     if (res === "SUCCESS") {
//       await onSuccessFunc?.(undefined as any as T | undefined);
//     }
//   }

//   return { click };
// }

// export function timActionDeleteSilentFetch<T, U extends any[]>(
//   confirmText: string | JSX.Element | { text: string; itemList: string[] },
//   actionFunc: (
//     ...args: U
//   ) => Promise<APIResponseWithData<T> | APIResponseNoData>,
//   silentFetch: (...args: U) => Promise<void>,
//   onSuccessFunc?: (data: T | undefined) => void | Promise<void>,
//   french?: boolean,
// ): TimActionDelete<U> {
//   async function click(...args: U) {
//     const res = await openComponent({
//       element: ConfirmForm,
//       props:
//         typeof confirmText === "object" && "itemList" in confirmText
//           ? {
//               text: confirmText.text,
//               itemList: confirmText.itemList,
//               actionFunc: () => actionFunc(...args),
//               silentFetch: () => silentFetch(...args),
//               french,
//             }
//           : {
//               text: confirmText,
//               actionFunc: () => actionFunc(...args),
//               silentFetch: () => silentFetch(...args),
//               french,
//             },
//     });

//     if (res === "SUCCESS") {
//       await onSuccessFunc?.(undefined as any as T | undefined);
//     }
//   }

//   return { click };
// }

// /////////////////
// //             //
// //    Query    //
// //             //
// /////////////////

// export type TimQuery<T> = {
//   state: Accessor<StateHolder<T>>;
//   fetch: () => Promise<void>;
//   silentFetch: () => Promise<void>;
//   mutate: (mutateFunc: () => Promise<APIResponseNoData>) => Promise<void>;
// };

// export function timQuery<T>(
//   queryFunc: () => Promise<APIResponseWithData<T>>,
//   loadingMsg: string,
// ): TimQuery<T> {
//   const [state, setter] = createSignal<StateHolder<T>>({
//     status: "loading",
//   });
//   async function fetch() {
//     await stateHolderQuery(setter, loadingMsg, queryFunc);
//   }
//   async function silentFetch() {
//     await stateHolderSilentQuery(setter, queryFunc);
//   }
//   async function mutate(mutateFunc: () => Promise<APIResponseNoData>) {
//     await stateHolderMutate(
//       setter,
//       loadingMsg,
//       mutateFunc,
//       loadingMsg,
//       queryFunc,
//     );
//   }
//   if (typeof window !== "undefined") {
//     fetch();
//   }
//   return {
//     state,
//     fetch,
//     silentFetch,
//     mutate,
//   };
// }

// ////////////////////////////////////////////////////////
// //   ______                                           //
// //  /      \                                          //
// // /$$$$$$  | __    __   ______    ______   __    __  //
// // $$ |  $$ |/  |  /  | /      \  /      \ /  |  /  | //
// // $$ |  $$ |$$ |  $$ |/$$$$$$  |/$$$$$$  |$$ |  $$ | //
// // $$ |_ $$ |$$ |  $$ |$$    $$ |$$ |  $$/ $$ |  $$ | //
// // $$ / \$$ |$$ \__$$ |$$$$$$$$/ $$ |      $$ \__$$ | //
// // $$ $$ $$< $$    $$/ $$       |$$ |      $$    $$ | //
// //  $$$$$$  | $$$$$$/   $$$$$$$/ $$/        $$$$$$$ | //
// //      $$$/                               /  \__$$ | //
// //                                         $$    $$/  //
// //                                          $$$$$$/   //
// //                                                    //
// ////////////////////////////////////////////////////////

// async function stateHolderQuery<T>(
//   setter: Setter<StateHolder<T>>,
//   loadingMsg: string,
//   queryFunc: () => Promise<APIResponseWithData<T>>,
// ) {
//   setter({ status: "loading", msg: loadingMsg });
//   const resQuery = await queryFunc();
//   if (resQuery.success === false) {
//     setter({ status: "error", err: resQuery.err });
//     return;
//   }
//   setter({ status: "ready", data: resQuery.data });
// }

// async function stateHolderSilentQuery<T>(
//   setter: Setter<StateHolder<T>>,
//   queryFunc: () => Promise<APIResponseWithData<T>>,
// ) {
//   const resQuery = await queryFunc();
//   if (resQuery.success === false) {
//     setter({ status: "error", err: resQuery.err });
//     return;
//   }
//   setter({ status: "ready", data: resQuery.data });
// }

// /////////////////////////////////////////////////////////////////////
// //  __       __              __                  __                //
// // /  \     /  |            /  |                /  |               //
// // $$  \   /$$ | __    __  _$$ |_     ______   _$$ |_     ______   //
// // $$$  \ /$$$ |/  |  /  |/ $$   |   /      \ / $$   |   /      \  //
// // $$$$  /$$$$ |$$ |  $$ |$$$$$$/    $$$$$$  |$$$$$$/   /$$$$$$  | //
// // $$ $$ $$/$$ |$$ |  $$ |  $$ | __  /    $$ |  $$ | __ $$    $$ | //
// // $$ |$$$/ $$ |$$ \__$$ |  $$ |/  |/$$$$$$$ |  $$ |/  |$$$$$$$$/  //
// // $$ | $/  $$ |$$    $$/   $$  $$/ $$    $$ |  $$  $$/ $$       | //
// // $$/      $$/  $$$$$$/     $$$$/   $$$$$$$/    $$$$/   $$$$$$$/  //
// //                                                                 //
// /////////////////////////////////////////////////////////////////////

// async function stateHolderMutate<T>(
//   setter: Setter<StateHolder<T>>,
//   mutatingMsg: string,
//   mutateFunc: () => Promise<APIResponseNoData>,
//   loadingMsg: string,
//   queryFunc: () => Promise<APIResponseWithData<T>>,
// ) {
//   setter({ status: "loading", msg: mutatingMsg });
//   const resMutate = await mutateFunc();
//   if (resMutate.success === false) {
//     setter({ status: "error", err: resMutate.err });
//     return;
//   }
//   setter({ status: "loading", msg: loadingMsg });
//   const resQuery = await queryFunc();
//   if (resQuery.success === false) {
//     setter({ status: "error", err: resQuery.err });
//     return;
//   }
//   setter({ status: "ready", data: resQuery.data });
// }

// ///////////////////////////////////////////////////////////////////////////////////////////////////////////
// //  ________                                        ______               __      __                      //
// // /        |                                      /      \             /  |    /  |                     //
// // $$$$$$$$/______    ______   _____  ____        /$$$$$$  |  _______  _$$ |_   $$/   ______   _______   //
// // $$ |__  /      \  /      \ /     \/    \       $$ |__$$ | /       |/ $$   |  /  | /      \ /       \  //
// // $$    |/$$$$$$  |/$$$$$$  |$$$$$$ $$$$  |      $$    $$ |/$$$$$$$/ $$$$$$/   $$ |/$$$$$$  |$$$$$$$  | //
// // $$$$$/ $$ |  $$ |$$ |  $$/ $$ | $$ | $$ |      $$$$$$$$ |$$ |        $$ | __ $$ |$$ |  $$ |$$ |  $$ | //
// // $$ |   $$ \__$$ |$$ |      $$ | $$ | $$ |      $$ |  $$ |$$ \_____   $$ |/  |$$ |$$ \__$$ |$$ |  $$ | //
// // $$ |   $$    $$/ $$ |      $$ | $$ | $$ |      $$ |  $$ |$$       |  $$  $$/ $$ |$$    $$/ $$ |  $$ | //
// // $$/     $$$$$$/  $$/       $$/  $$/  $$/       $$/   $$/  $$$$$$$/    $$$$/  $$/  $$$$$$/  $$/   $$/  //
// //                                                                                                       //
// ///////////////////////////////////////////////////////////////////////////////////////////////////////////

// async function stateHolderFormAction<T>(
//   setter: Setter<StateHolderFormAction>,
//   actionFunc: () => Promise<APIResponseWithData<T> | APIResponseNoData>,
//   onSuccessFunc?: (data: T | undefined) => void | Promise<void>,
// ) {
//   setter({ status: "loading" });
//   const resAction = await actionFunc();
//   if (resAction.success === false) {
//     setter({ status: "error", err: resAction.err });
//     return;
//   }
//   setter({ status: "ready" });
//   await onSuccessFunc?.((resAction as { success: true; data?: T }).data);
// }

// async function stateHolderFormActionSilentFetch<T>(
//   setter: Setter<StateHolderFormAction>,
//   actionFunc: () => Promise<APIResponseWithData<T> | APIResponseNoData>,
//   silentFetch: () => Promise<void>,
//   onSuccessFunc?: (data: T | undefined) => void | Promise<void>,
// ) {
//   setter({ status: "loading" });
//   const resAction = await actionFunc();
//   if (resAction.success === false) {
//     setter({ status: "error", err: resAction.err });
//     return;
//   }
//   await silentFetch();
//   setter({ status: "ready" });
//   await onSuccessFunc?.((resAction as { success: true; data?: T }).data);
// }

// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// //  _______               __      __                                 ______               __      __                      //
// // /       \             /  |    /  |                               /      \             /  |    /  |                     //
// // $$$$$$$  | __    __  _$$ |_  _$$ |_     ______   _______        /$$$$$$  |  _______  _$$ |_   $$/   ______   _______   //
// // $$ |__$$ |/  |  /  |/ $$   |/ $$   |   /      \ /       \       $$ |__$$ | /       |/ $$   |  /  | /      \ /       \  //
// // $$    $$< $$ |  $$ |$$$$$$/ $$$$$$/   /$$$$$$  |$$$$$$$  |      $$    $$ |/$$$$$$$/ $$$$$$/   $$ |/$$$$$$  |$$$$$$$  | //
// // $$$$$$$  |$$ |  $$ |  $$ | __ $$ | __ $$ |  $$ |$$ |  $$ |      $$$$$$$$ |$$ |        $$ | __ $$ |$$ |  $$ |$$ |  $$ | //
// // $$ |__$$ |$$ \__$$ |  $$ |/  |$$ |/  |$$ \__$$ |$$ |  $$ |      $$ |  $$ |$$ \_____   $$ |/  |$$ |$$ \__$$ |$$ |  $$ | //
// // $$    $$/ $$    $$/   $$  $$/ $$  $$/ $$    $$/ $$ |  $$ |      $$ |  $$ |$$       |  $$  $$/ $$ |$$    $$/ $$ |  $$ | //
// // $$$$$$$/   $$$$$$/     $$$$/   $$$$/   $$$$$$/  $$/   $$/       $$/   $$/  $$$$$$$/    $$$$/  $$/  $$$$$$/  $$/   $$/  //
// //                                                                                                                        //
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// async function stateHolderButtonAction<T>(
//   setter: Setter<StateHolderButtonAction>,
//   actionFunc: () => Promise<APIResponseWithData<T> | APIResponseNoData>,
//   onSuccessFunc?: (data: T | undefined) => void | Promise<void>,
// ) {
//   setter({ status: "loading" });
//   const resAction = await actionFunc();
//   if (resAction?.success === false) {
//     setter({ status: "ready" });
//     await openAlert({ title: "Error", text: resAction.err, intent: "danger" });
//     return;
//   }
//   setter({ status: "ready" });
//   await onSuccessFunc?.((resAction as { success: true; data?: T }).data);
// }

// async function stateHolderButtonActionSilentFetch<T>(
//   setter: Setter<StateHolderButtonAction>,
//   actionFunc: () => Promise<APIResponseWithData<T> | APIResponseNoData>,
//   silentFetch: () => Promise<void>,
//   onSuccessFunc?: (data: T | undefined) => void | Promise<void>,
// ) {
//   setter({ status: "loading" });
//   const resAction = await actionFunc();
//   if (resAction?.success === false) {
//     setter({ status: "ready" });
//     await openAlert({ title: "Error", text: resAction.err, intent: "danger" });
//     return;
//   }
//   await silentFetch();
//   setter({ status: "ready" });
//   await onSuccessFunc?.((resAction as { success: true; data?: T }).data);
// }

// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// //  _______             __              __                                            __      __                      //
// // /       \           /  |            /  |                                          /  |    /  |                     //
// // $$$$$$$  |  ______  $$ |  ______   _$$ |_     ______          ______    _______  _$$ |_   $$/   ______   _______   //
// // $$ |  $$ | /      \ $$ | /      \ / $$   |   /      \        /      \  /       |/ $$   |  /  | /      \ /       \  //
// // $$ |  $$ |/$$$$$$  |$$ |/$$$$$$  |$$$$$$/   /$$$$$$  |       $$$$$$  |/$$$$$$$/ $$$$$$/   $$ |/$$$$$$  |$$$$$$$  | //
// // $$ |  $$ |$$    $$ |$$ |$$    $$ |  $$ | __ $$    $$ |       /    $$ |$$ |        $$ | __ $$ |$$ |  $$ |$$ |  $$ | //
// // $$ |__$$ |$$$$$$$$/ $$ |$$$$$$$$/   $$ |/  |$$$$$$$$/       /$$$$$$$ |$$ \_____   $$ |/  |$$ |$$ \__$$ |$$ |  $$ | //
// // $$    $$/ $$       |$$ |$$       |  $$  $$/ $$       |      $$    $$ |$$       |  $$  $$/ $$ |$$    $$/ $$ |  $$ | //
// // $$$$$$$/   $$$$$$$/ $$/  $$$$$$$/    $$$$/   $$$$$$$/        $$$$$$$/  $$$$$$$/    $$$$/  $$/  $$$$$$/  $$/   $$/  //
// //                                                                                                                    //
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// // /**
// //  * @deprecated Use timActionDelete instead. This function will be removed in a future version.
// //  */
// //  async function stateHolderDeleteAction<T>(
// //   text: string | JSX.Element | { text: string; itemList: string[] },
// //   actionFunc: () => Promise<APIResponseWithData<T> | APIResponseNoData>,
// //   onSuccessFunc?: () => void | Promise<void>,
// //   french?: boolean,
// // ) {
// //   const res = await openComponent({
// //     element: ConfirmForm,
// //     props:
// //       typeof text === "object" && "itemList" in text
// //         ? {
// //             text: text.text,
// //             itemList: text.itemList,
// //             actionFunc,
// //             french,
// //           }
// //         : {
// //             text,
// //             actionFunc,
// //             french,
// //           },
// //   });
// //   if (res === "SUCCESS") {
// //     onSuccessFunc?.();
// //   }
// // }

// // /**
// //  * @deprecated Use timActionDeleteSilentFetch instead. This function will be removed in a future version.
// //  */
// //  async function stateHolderDeleteActionSilentFetch<T>(
// //   text: string | JSX.Element | { text: string; itemList: string[] },
// //   actionFunc: () => Promise<APIResponseWithData<T> | APIResponseNoData>,
// //   silentFetch: () => Promise<void>,
// //   onSuccessFunc?: () => void | Promise<void>,
// //   french?: boolean,
// // ) {
// //   const res = await openComponent({
// //     element: ConfirmForm,
// //     props:
// //       typeof text === "object" && "itemList" in text
// //         ? {
// //             text: text.text,
// //             itemList: text.itemList,
// //             actionFunc,
// //             silentFetch,
// //             french,
// //           }
// //         : {
// //             text,
// //             actionFunc,
// //             silentFetch,
// //             french,
// //           },
// //   });
// //   if (res === "SUCCESS") {
// //     onSuccessFunc?.();
// //   }
// // }
