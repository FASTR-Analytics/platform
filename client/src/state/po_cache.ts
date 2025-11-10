import {
  APIResponseWithData,
  ItemsHolderPresentationObject,
  PresentationObjectConfig,
  PresentationObjectDetail,
  ReplicantValueOverride,
  getFetchConfigFromPresentationObjectConfig,
  getReplicateByProp,
} from "lib";
import { ADTFigure, StateHolder } from "panther";
import { getFigureInputsFromPresentationObject } from "~/generate_visualization/mod";
import { serverActions } from "~/server_actions";
import {
  _PO_DETAIL_CACHE,
  _PO_ITEMS_CACHE,
  _RESULTS_VALUE_INFO_CACHE,
} from "./caches/visualizations";
import { poItemsQueue, resultsValueInfoQueue } from "~/utils/request_queue";

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  _______    ______         __     __                     __            __        __                  __             ______           //
// /       \  /      \       /  |   /  |                   /  |          /  |      /  |                /  |           /      \          //
// $$$$$$$  |/$$$$$$  |      $$ |   $$ | ______    ______  $$/   ______  $$ |____  $$ |  ______        $$/  _______  /$$$$$$  |______   //
// $$ |__$$ |$$ |  $$ |      $$ |   $$ |/      \  /      \ /  | /      \ $$      \ $$ | /      \       /  |/       \ $$ |_ $$//      \  //
// $$    $$< $$ |  $$ |      $$  \ /$$/ $$$$$$  |/$$$$$$  |$$ | $$$$$$  |$$$$$$$  |$$ |/$$$$$$  |      $$ |$$$$$$$  |$$   |  /$$$$$$  | //
// $$$$$$$  |$$ |  $$ |       $$  /$$/  /    $$ |$$ |  $$/ $$ | /    $$ |$$ |  $$ |$$ |$$    $$ |      $$ |$$ |  $$ |$$$$/   $$ |  $$ | //
// $$ |  $$ |$$ \__$$ |        $$ $$/  /$$$$$$$ |$$ |      $$ |/$$$$$$$ |$$ |__$$ |$$ |$$$$$$$$/       $$ |$$ |  $$ |$$ |    $$ \__$$ | //
// $$ |  $$ |$$    $$/          $$$/   $$    $$ |$$ |      $$ |$$    $$ |$$    $$/ $$ |$$       |      $$ |$$ |  $$ |$$ |    $$    $$/  //
// $$/   $$/  $$$$$$/            $/     $$$$$$$/ $$/       $$/  $$$$$$$/ $$$$$$$/  $$/  $$$$$$$/       $$/ $$/   $$/ $$/      $$$$$$/   //
//                                                                                                                                      //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export async function getResultsValueInfoForPresentationObjectFromCacheOrFetch(
  projectId: string,
  moduleId: string,
  resultsValueId: string,
) {
  const { data, version } = await _RESULTS_VALUE_INFO_CACHE.get({
    projectId,
    resultsValueId,
    moduleId,
  });

  if (data) {
    return { success: true, data } as const;
  }

  // Queue the network request to prevent overwhelming server
  const newPromise = resultsValueInfoQueue.enqueue(() =>
    serverActions.getResultsValueInfoForPresentationObject({
      projectId,
      resultsValueId,
      moduleId,
    })
  );

  _RESULTS_VALUE_INFO_CACHE.setPromise(
    newPromise,
    {
      projectId,
      resultsValueId,
      moduleId,
    },
    version,
  );

  return await newPromise;
}

/////////////////////////////////////////////////////////////////////////////////////////
//  ________  __                  __                                  __               //
// /        |/  |                /  |                                /  |              //
// $$$$$$$$/ $$/   ______        $$/  _______    ______   __    __  _$$ |_    _______  //
// $$ |__    /  | /      \       /  |/       \  /      \ /  |  /  |/ $$   |  /       | //
// $$    |   $$ |/$$$$$$  |      $$ |$$$$$$$  |/$$$$$$  |$$ |  $$ |$$$$$$/  /$$$$$$$/  //
// $$$$$/    $$ |$$ |  $$ |      $$ |$$ |  $$ |$$ |  $$ |$$ |  $$ |  $$ | __$$      \  //
// $$ |      $$ |$$ \__$$ |      $$ |$$ |  $$ |$$ |__$$ |$$ \__$$ |  $$ |/  |$$$$$$  | //
// $$ |      $$ |$$    $$ |      $$ |$$ |  $$ |$$    $$/ $$    $$/   $$  $$//     $$/  //
// $$/       $$/  $$$$$$$ |      $$/ $$/   $$/ $$$$$$$/   $$$$$$/     $$$$/ $$$$$$$/   //
//               /  \__$$ |                    $$ |                                    //
//               $$    $$/                     $$ |                                    //
//                $$$$$$/                      $$/                                     //
//                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////

export async function* getPOFigureInputsFromCacheOrFetch_AsyncGenerator(
  projectId: string,
  presentationObjectId: string,
  replicateOverride: ReplicantValueOverride | undefined,
): AsyncGenerator<StateHolder<ADTFigure>> {
  yield { status: "loading" };
  const iterPoDetail = getPODetailFromCacheorFetch_AsyncGenderator(
    projectId,
    presentationObjectId,
  );
  let readyPoDetail;
  for await (const resPoDetail of iterPoDetail) {
    if (resPoDetail.status === "error") {
      yield resPoDetail;
      return;
    }
    if (resPoDetail.status === "ready") {
      readyPoDetail = resPoDetail;
      break;
    }
  }
  if (!readyPoDetail) {
    throw new Error("Should not happen");
  }
  ///////////////////////////////////////////////////////////////////////////////////
  ////////////////////// Integrate OVERRIDES for reports /////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////
  const configWithReplicateOverride: PresentationObjectConfig = structuredClone(
    readyPoDetail.data.config,
  );
  if (replicateOverride?.additionalScale) {
    configWithReplicateOverride.s.scale =
      configWithReplicateOverride.s.scale * replicateOverride.additionalScale;
  }
  const replicateBy = getReplicateByProp(configWithReplicateOverride);
  if (
    replicateBy &&
    replicateOverride &&
    replicateOverride.selectedReplicantValue
  ) {
    configWithReplicateOverride.d.selectedReplicantValue =
      replicateOverride.selectedReplicantValue;
  }
  if (replicateOverride?.hideFigureCaption) {
    configWithReplicateOverride.t.caption = "";
  }
  if (replicateOverride?.hideFigureSubCaption) {
    configWithReplicateOverride.t.subCaption = "";
  }
  if (replicateOverride?.hideFigureFootnote) {
    configWithReplicateOverride.t.footnote = "";
  }
  ///////////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////

  const iterPoItems = getPresentationObjectItemsFromCacheOrFetch_AsyncGenerator(
    projectId,
    readyPoDetail.data,
    configWithReplicateOverride,
  );
  let readyPoItems;
  for await (const resPoItems of iterPoItems) {
    if (resPoItems.status === "error") {
      yield resPoItems;
      return;
    }
    if (resPoItems.status === "ready") {
      readyPoItems = resPoItems;
      break;
    }
  }
  if (!readyPoItems) {
    throw new Error("Should not happen");
  }

  // Check status and handle non-ok states
  if (readyPoItems.data.ih.status === "too_many_items") {
    yield {
      status: "error",
      err: "Too many data points selected. Please add filters or reduce disaggregation options to view fewer than 20,000 data points.",
    };
    return;
  }

  if (readyPoItems.data.ih.status === "no_data_available") {
    yield {
      status: "error",
      err: "No data available with current filter selection.",
    };
    return;
  }

  const figureInputs = getFigureInputsFromPresentationObject(
    readyPoDetail.data.resultsValue,
    readyPoItems.data.ih,
    readyPoItems.data.config,
  );
  yield figureInputs;
}

export async function getPOFigureInputsFromCacheOrFetch(
  projectId: string,
  presentationObjectId: string,
  replicateOverride: ReplicantValueOverride | undefined,
): Promise<APIResponseWithData<ADTFigure>> {
  const iter = getPOFigureInputsFromCacheOrFetch_AsyncGenerator(
    projectId,
    presentationObjectId,
    replicateOverride,
  );
  const arr: StateHolder<ADTFigure>[] = [];
  for await (const y of iter) {
    arr.push(y);
  }
  const last = arr.at(-1);
  if (!last) {
    return { success: false, err: "Should not be possible" };
  }
  if (last.status === "loading") {
    return { success: false, err: "Should not be possible" };
  }
  if (last.status === "error") {
    return { success: false, err: last.err };
  }
  return { success: true, data: last.data };
}

////////////////////////////////////////////////////////////////////////////////
//  _______    ______               __              __                __  __  //
// /       \  /      \             /  |            /  |              /  |/  | //
// $$$$$$$  |/$$$$$$  |        ____$$ |  ______   _$$ |_     ______  $$/ $$ | //
// $$ |__$$ |$$ |  $$ |       /    $$ | /      \ / $$   |   /      \ /  |$$ | //
// $$    $$/ $$ |  $$ |      /$$$$$$$ |/$$$$$$  |$$$$$$/    $$$$$$  |$$ |$$ | //
// $$$$$$$/  $$ |  $$ |      $$ |  $$ |$$    $$ |  $$ | __  /    $$ |$$ |$$ | //
// $$ |      $$ \__$$ |      $$ \__$$ |$$$$$$$$/   $$ |/  |/$$$$$$$ |$$ |$$ | //
// $$ |      $$    $$/       $$    $$ |$$       |  $$  $$/ $$    $$ |$$ |$$ | //
// $$/        $$$$$$/         $$$$$$$/  $$$$$$$/    $$$$/   $$$$$$$/ $$/ $$/  //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

async function* getPODetailFromCacheorFetch_AsyncGenderator(
  projectId: string,
  presentationObjectId: string,
): AsyncGenerator<StateHolder<PresentationObjectDetail>> {
  const t0 = performance.now();
  const { data, version, isInflight } = await _PO_DETAIL_CACHE.get({
    projectId,
    presentationObjectId,
  });

  if (data) {
    const t1 = performance.now();
    const status = isInflight ? "INFLIGHT" : "HIT";
    console.log(`[VIZ] ${presentationObjectId.slice(0, 8)} "${data.label}" | Detail: ${status} (${(t1 - t0).toFixed(0)}ms)`);
    yield {
      status: "ready",
      data,
    };
    return;
  }

  yield {
    status: "loading",
  };

  const newPromise = serverActions.getPresentationObjectDetail({
    projectId,
    po_id: presentationObjectId,
  });

  _PO_DETAIL_CACHE.setPromise(
    newPromise,
    {
      projectId,
      presentationObjectId,
    },
    version,
  );

  const res = await newPromise;
  const t1 = performance.now();
  if (res.success === false) {
    console.log(`[VIZ] ${presentationObjectId.slice(0, 8)} | Detail: MISS ERROR (${(t1 - t0).toFixed(0)}ms)`);
    yield {
      status: "error",
      err: res.err,
    };
    return;
  }
  console.log(`[VIZ] ${presentationObjectId.slice(0, 8)} "${res.data.label}" | Detail: MISS (${(t1 - t0).toFixed(0)}ms)`);
  yield {
    status: "ready",
    data: res.data,
  };
}

export async function getPODetailFromCacheorFetch(
  projectId: string,
  presentationObjectId: string,
): Promise<APIResponseWithData<PresentationObjectDetail>> {
  const iter = getPODetailFromCacheorFetch_AsyncGenderator(
    projectId,
    presentationObjectId,
  );
  const arr: StateHolder<PresentationObjectDetail>[] = [];
  for await (const y of iter) {
    arr.push(y);
  }
  const last = arr.at(-1);
  if (!last) {
    return { success: false, err: "Should not be possible" };
  }
  if (last.status === "loading") {
    return { success: false, err: "Should not be possible" };
  }
  if (last.status === "error") {
    return { success: false, err: last.err };
  }
  // At this point, last.status must be "ready" and last.data must be PresentationObjectDetail
  if (last.status !== "ready") {
    return { success: false, err: "Should not be possible" };
  }
  return { success: true, data: last.data };
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  _______    ______          ______             __                __              __    __                                        //
// /       \  /      \        /      \           /  |              /  |            /  |  /  |                                       //
// $$$$$$$  |/$$$$$$  |      /$$$$$$  |______   _$$ |_     _______ $$ |____        $$/  _$$ |_     ______   _____  ____    _______  //
// $$ |__$$ |$$ |  $$ |      $$ |_ $$//      \ / $$   |   /       |$$      \       /  |/ $$   |   /      \ /     \/    \  /       | //
// $$    $$/ $$ |  $$ |      $$   |  /$$$$$$  |$$$$$$/   /$$$$$$$/ $$$$$$$  |      $$ |$$$$$$/   /$$$$$$  |$$$$$$ $$$$  |/$$$$$$$/  //
// $$$$$$$/  $$ |  $$ |      $$$$/   $$    $$ |  $$ | __ $$ |      $$ |  $$ |      $$ |  $$ | __ $$    $$ |$$ | $$ | $$ |$$      \  //
// $$ |      $$ \__$$ |      $$ |    $$$$$$$$/   $$ |/  |$$ \_____ $$ |  $$ |      $$ |  $$ |/  |$$$$$$$$/ $$ | $$ | $$ | $$$$$$  | //
// $$ |      $$    $$/       $$ |    $$       |  $$  $$/ $$       |$$ |  $$ |      $$ |  $$  $$/ $$       |$$ | $$ | $$ |/     $$/  //
// $$/        $$$$$$/        $$/      $$$$$$$/    $$$$/   $$$$$$$/ $$/   $$/       $$/    $$$$/   $$$$$$$/ $$/  $$/  $$/ $$$$$$$/   //
//                                                                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export async function* getPresentationObjectItemsFromCacheOrFetch_AsyncGenerator(
  projectId: string,
  poDetail: PresentationObjectDetail,
  config: PresentationObjectConfig,
): AsyncGenerator<
  StateHolder<{
    ih: ItemsHolderPresentationObject;
    config: PresentationObjectConfig;
  }>
> {
  const t0 = performance.now();
  const resResultsValueInfo =
    await getResultsValueInfoForPresentationObjectFromCacheOrFetch(
      poDetail.projectId,
      poDetail.resultsValue.moduleId,
      poDetail.resultsValue.id,
    );
  if (resResultsValueInfo.success === false) {
    yield {
      status: "error",
      err: resResultsValueInfo.err,
    };
    return;
  }
  const resFetchConfig = getFetchConfigFromPresentationObjectConfig(
    poDetail.resultsValue,
    config,
  );
  if (resFetchConfig.success === false) {
    yield {
      status: "error",
      err: resFetchConfig.err,
    };
    return;
  }

  const { data, version, isInflight } = await _PO_ITEMS_CACHE.get({
    projectId,
    resultsObjectId: poDetail.resultsValue.resultsObjectId,
    fetchConfig: resFetchConfig.data,
    moduleId: poDetail.resultsValue.moduleId,
  });

  if (data) {
    const t1 = performance.now();
    const cacheStatus = isInflight ? "INFLIGHT" : "HIT";
    const itemsInfo = data.status === "ok"
      ? `${data.items.length} rows`
      : data.status === "too_many_items"
      ? "TOO MANY ITEMS"
      : "NO DATA";
    console.log(`[VIZ] ${poDetail.id.slice(0, 8)} "${poDetail.label}" | Items: ${cacheStatus} (${(t1 - t0).toFixed(0)}ms) | ${itemsInfo}`);
    yield {
      status: "ready",
      data: { ih: data, config },
    };
    return;
  }

  yield {
    status: "loading",
  };

  // Queue the network request to prevent overwhelming server
  const newPromise = poItemsQueue.enqueue(() =>
    serverActions.getPresentationObjectItems({
      projectId,
      presentationObjectId: poDetail.id,
      resultsObjectId: poDetail.resultsValue.resultsObjectId,
      fetchConfig: resFetchConfig.data,
      firstPeriodOption: poDetail.resultsValue.periodOptions.at(0),
    })
  );

  _PO_ITEMS_CACHE.setPromise(
    newPromise,
    {
      projectId,
      resultsObjectId: poDetail.resultsValue.resultsObjectId,
      fetchConfig: resFetchConfig.data,
      moduleId: poDetail.resultsValue.moduleId,
    },
    version,
  );

  const res = await newPromise;
  const t1 = performance.now();
  const queueStats = poItemsQueue.getStats();
  if (res.success === false) {
    console.log(`[VIZ] ${poDetail.id.slice(0, 8)} "${poDetail.label}" | Items: MISS ERROR (${(t1 - t0).toFixed(0)}ms) [Queue: ${queueStats.running}/${queueStats.maxConcurrent} running, ${queueStats.queued} waiting]`);
    yield { status: "error", err: res.err };
    return;
  }

  // Log based on status
  if (res.data.status === "ok") {
    console.log(`[VIZ] ${poDetail.id.slice(0, 8)} "${poDetail.label}" | Items: MISS (${(t1 - t0).toFixed(0)}ms) | ${res.data.items.length} rows [Queue: ${queueStats.running}/${queueStats.maxConcurrent} running, ${queueStats.queued} waiting]`);
  } else if (res.data.status === "too_many_items") {
    console.log(`[VIZ] ${poDetail.id.slice(0, 8)} "${poDetail.label}" | Items: MISS (${(t1 - t0).toFixed(0)}ms) | TOO MANY ITEMS [Queue: ${queueStats.running}/${queueStats.maxConcurrent} running, ${queueStats.queued} waiting]`);
  } else {
    console.log(`[VIZ] ${poDetail.id.slice(0, 8)} "${poDetail.label}" | Items: MISS (${(t1 - t0).toFixed(0)}ms) | NO DATA [Queue: ${queueStats.running}/${queueStats.maxConcurrent} running, ${queueStats.queued} waiting]`);
  }

  yield {
    status: "ready",
    data: { ih: res.data, config },
  };
}

export async function getPresentationObjectItemsFromCacheOrFetch(
  projectId: string,
  poDetail: PresentationObjectDetail,
  config: PresentationObjectConfig,
): Promise<
  APIResponseWithData<{
    ih: ItemsHolderPresentationObject;
    config: PresentationObjectConfig;
  }>
> {
  const iter = getPresentationObjectItemsFromCacheOrFetch_AsyncGenerator(
    projectId,
    poDetail,
    config,
  );
  const arr: StateHolder<{
    ih: ItemsHolderPresentationObject;
    config: PresentationObjectConfig;
  }>[] = [];
  for await (const y of iter) {
    arr.push(y);
  }
  const last = arr.at(-1);
  if (!last) {
    return { success: false, err: "Should not be possible" };
  }
  if (last.status === "loading") {
    return { success: false, err: "Should not be possible" };
  }
  if (last.status === "error") {
    return { success: false, err: last.err };
  }
  return { success: true, data: last.data };
}
