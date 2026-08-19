import type { InstanceSseMessage, LastUpdateTableName, RunProgress } from "lib";
import { t3 } from "lib";
import { Show, on, createEffect, type JSX } from "solid-js";
import { onMount, onCleanup, createSignal } from "solid-js";
import { _SERVER_HOST, serverActions } from "~/server_actions";
import { evictDeletedGeoJsonLevels, preloadGeoJson } from "~/state/instance/t2_geojson";
import {
  instanceState,
  initInstanceState,
  resetInstanceState,
  updateInstanceConfig,
  updateInstanceFolders,
  updateInstanceLastUpdated,
  updateInstanceReadyPackages,
  upsertInstanceProducts,
  removeInstanceProducts,
  updateInstanceUsers,
  updateInstanceAssets,
  updateInstanceGeoJsonMaps,
  updateInstanceRunsCatalog,
  updateRunsCatalogSignal,
  updatePinnedRunId,
  canSeeRunsCatalog,
  updateInstanceStructure,
  updateInstanceIndicators,
  updateInstanceDatasets,
  updateCurrentUser,
} from "./t1_store";
import { connectCollab, disconnectCollab } from "./collab";

// Live results-package generation (Q-B): ephemeral execution state, not T1 —
// these go to listeners and never touch the store. (The catalogue LISTING is
// T1 via the signal-plus-own-fetch pattern: `runs_catalog_updated` is a
// data-free nonce and the boundary below fetches `runsCatalog` per user.) The
// server only sends these two to can_configure_data users, so a non-admin's
// listeners simply never fire.
type InstanceRunProgressListener = (
  runId: string,
  progress: RunProgress,
) => void;
type InstanceRScriptListener = (
  runId: string,
  moduleId: string,
  text: string,
) => void;

const runProgressListeners = new Set<InstanceRunProgressListener>();
const rScriptListeners = new Set<InstanceRScriptListener>();

export function addInstanceRunProgressListener(
  listener: InstanceRunProgressListener,
): () => void {
  runProgressListeners.add(listener);
  return () => runProgressListeners.delete(listener);
}

export function addInstanceRScriptListener(
  listener: InstanceRScriptListener,
): () => void {
  rScriptListeners.add(listener);
  return () => rScriptListeners.delete(listener);
}

// The sanctioned imperative side-channel (S3 / PROTOCOL_APP_STATE): entity
// change notification for consumers that must react to a change WITHOUT
// subscribing to the store — the copilot feeds them into the conversation.
// Fires for both stamp carriers: the `last_updated` message (slides) and the
// per-row `products_upserted` summary, whose own `lastUpdated` IS the
// products table's stamp.
type LastUpdatedListener = (
  tableName: LastUpdateTableName,
  ids: string[],
  timestamp: string,
) => void;

const lastUpdatedListeners = new Set<LastUpdatedListener>();

export function addLastUpdatedListener(listener: LastUpdatedListener): () => void {
  lastUpdatedListeners.add(listener);
  return () => lastUpdatedListeners.delete(listener);
}

function fireLastUpdatedListeners(
  tableName: LastUpdateTableName,
  ids: string[],
  timestamp: string,
): void {
  for (const listener of lastUpdatedListeners) {
    listener(tableName, ids, timestamp);
  }
}

// Retries never give up: past the threshold the ladder keeps trying at the
// capped delay forever (a dead connection would otherwise freeze T1 behind a
// working-looking UI, with `isReady` never unset). The threshold only decides
// when to SHOW the down state — the pre-ready failure screen and the
// post-ready "Reconnecting" banner both read `instanceSseDown`.
const _FAILED_ATTEMPTS_BEFORE_SHOWING_DOWN = 5;
const _BASE_RETRY_DELAY = 1000;
const _MAX_RETRY_DELAY = 30000;

function getRetryDelay(attempt: number): number {
  return Math.min(_BASE_RETRY_DELAY * Math.pow(2, attempt), _MAX_RETRY_DELAY);
}

let evtSource: EventSource | null = null;
let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
let connectionAttempts = 0;
let shouldBeConnected = false;
// Was the CURRENT connection admitted as an approved user? The server withholds
// products, folders, ready packages and the roster from an unapproved
// connection, and it decides that once, at connect. So an approval that lands
// mid-session needs a new connection, not just a store update (D8).
let connectedAsApproved = false;

const [connectionDown, setConnectionDown] = createSignal(false);

export function instanceSseDown(): boolean {
  return connectionDown();
}

// Laptop-wake / wifi-return: skip the remaining backoff and reconnect now.
// Registered once for the app's lifetime; inert while the boundary is
// unmounted (shouldBeConnected false) or the connection is healthy.
let onlineListenerRegistered = false;
function registerOnlineListener(): void {
  if (onlineListenerRegistered) {
    return;
  }
  onlineListenerRegistered = true;
  window.addEventListener("online", () => {
    if (!shouldBeConnected) {
      return;
    }
    if (evtSource && evtSource.readyState !== EventSource.CLOSED) {
      return;
    }
    connectionAttempts = 0;
    if (retryTimeoutId) {
      clearTimeout(retryTimeoutId);
      retryTimeoutId = null;
    }
    connectInstanceSSE();
  });
}

export function connectInstanceSSE(): void {
  if (evtSource && evtSource.readyState !== EventSource.CLOSED) {
    return;
  }

  shouldBeConnected = true;
  registerOnlineListener();
  connectionAttempts++;
  const url = `${_SERVER_HOST}/instance_updates`;
  evtSource = new EventSource(url, { withCredentials: true });

  evtSource.onopen = () => {
    connectionAttempts = 0;
    setConnectionDown(false);
  };

  evtSource.onmessage = (event) => {
    let msg: InstanceSseMessage;
    try {
      msg = JSON.parse(event.data) as InstanceSseMessage;
    } catch {
      console.error("Failed to parse instance SSE message:", event.data);
      return;
    }

    switch (msg.type) {
      case "starting":
        // Recorded BEFORE the store write: the approval effect below reads it
        // to tell "this connection was opened unapproved and needs a fresh
        // payload" from "already approved, nothing to redo".
        connectedAsApproved = msg.data.currentUserApproved;
        initInstanceState(msg.data);
        preloadGeoJson(msg.data.geojsonMaps);
        break;
      case "config_updated":
        updateInstanceConfig(msg.data);
        break;
      case "products_upserted":
        upsertInstanceProducts(msg.data.products);
        for (const product of msg.data.products) {
          fireLastUpdatedListeners("products", [product.id], product.lastUpdated);
        }
        break;
      case "products_deleted":
        removeInstanceProducts(msg.data.ids);
        break;
      case "folders_updated":
        updateInstanceFolders(msg.data.folders);
        break;
      case "last_updated":
        updateInstanceLastUpdated(
          msg.data.tableName,
          msg.data.ids,
          msg.data.lastUpdated,
        );
        fireLastUpdatedListeners(
          msg.data.tableName,
          msg.data.ids,
          msg.data.lastUpdated,
        );
        break;
      case "users_updated":
        updateInstanceUsers(msg.data);
        updateCurrentUser(msg.data.find((u) => u.email === instanceState.currentUserEmail));
        break;
      case "assets_updated":
        updateInstanceAssets(msg.data);
        break;
      case "runs_catalog_updated":
        updateRunsCatalogSignal(msg.data);
        break;
      case "pinned_run_updated":
        updatePinnedRunId(msg.data.pinnedRunId);
        break;
      case "geojson_maps_updated":
        updateInstanceGeoJsonMaps(msg.data);
        evictDeletedGeoJsonLevels(msg.data);
        preloadGeoJson(msg.data);
        break;
      case "structure_updated":
        updateInstanceStructure(msg.data);
        break;
      case "indicators_updated":
        updateInstanceIndicators(msg.data);
        break;
      case "datasets_updated":
        updateInstanceDatasets(msg.data);
        break;
      case "run_progress":
        for (const listener of runProgressListeners) {
          listener(msg.data.runId, msg.data.progress);
        }
        break;
      case "r_script":
        for (const listener of rScriptListeners) {
          listener(msg.data.runId, msg.data.moduleId, msg.data.text);
        }
        break;
      case "error":
        console.error("Instance SSE error from server:", msg.data.message);
        break;
    }
  };

  evtSource.onerror = () => {
    if (evtSource) {
      evtSource.close();
      evtSource = null;
    }

    if (connectionAttempts > _FAILED_ATTEMPTS_BEFORE_SHOWING_DOWN) {
      setConnectionDown(true);
    }
    const delay = getRetryDelay(connectionAttempts);
    if (retryTimeoutId) clearTimeout(retryTimeoutId);
    retryTimeoutId = setTimeout(connectInstanceSSE, delay);
  };
}

export function disconnectInstanceSSE(): void {
  shouldBeConnected = false;
  if (retryTimeoutId) {
    clearTimeout(retryTimeoutId);
    retryTimeoutId = null;
  }
  if (evtSource) {
    evtSource.close();
    evtSource = null;
  }
  connectionAttempts = 0;
  connectedAsApproved = false;
  setConnectionDown(false);
  resetInstanceState();
}

// The unapproved → approved transition (D8). Everything approval unlocks is
// decided per CONNECTION server-side, so re-open it; collab is opened at the
// same time because an unapproved user was never allowed on that socket.
// The reset inside the disconnect flips `currentUserApproved` back to false
// for one tick — the approval effect below no-ops on that, and re-runs when
// the new `starting` payload lands.
export function reconnectForApproval(): void {
  disconnectInstanceSSE();
  connectInstanceSSE();
  connectCollab();
}

// ============================================================================
// Boundary component
// ============================================================================

export function InstanceSSEBoundary(p: { children: JSX.Element }) {
  onMount(() => connectInstanceSSE());
  onCleanup(() => {
    disconnectInstanceSSE();
    disconnectCollab();
  });

  // The collab socket is instance-wide and admits approved users only (D8), so
  // approval is the one thing it waits on. No `defer` — an already-approved
  // user connects on the first `starting`.
  //
  // Nothing here DISCONNECTS collab on a false reading: `currentUserApproved`
  // goes false transiently on every reconnect (the store reset), and a real
  // de-approval is closed server-side (`closeConnectionsForEmail`), which is
  // the authority anyway.
  createEffect(on(
    () => instanceState.currentUserApproved,
    (approved) => {
      if (!approved) {
        return;
      }
      if (!connectedAsApproved) {
        reconnectForApproval();
        return;
      }
      connectCollab();
    },
  ));

  // Ready packages: the `runsCatalog` idiom exactly (D8 / §2.4) — filled by
  // `starting`, refetched on the EXISTING `runs_catalog_updated` nonce, no
  // message type of its own. Unlike the catalogue below it is gated on
  // APPROVAL, not on can_configure_data: a ready package's label is what
  // every product card and the package picker show (the deliberate revision
  // of Q-B, `lib/types/instance_sse.ts`). Tracking the flag live means an
  // approval also fills the list without waiting for the next nonce.
  createEffect(on(
    () => [instanceState.runsCatalogSignal, instanceState.currentUserApproved] as const,
    () => {
      const controller = new AbortController();
      onCleanup(() => controller.abort());

      if (!instanceState.currentUserApproved) {
        updateInstanceReadyPackages([]);
        return;
      }
      serverActions.listAttachableResultsPackages({}).then((res) => {
        if (controller.signal.aborted) return;
        if (res.success) {
          updateInstanceReadyPackages(
            res.data.map((run) => ({
              id: run.id,
              label: run.label,
              createdAt: run.createdAt,
            })),
          );
        } else {
          console.error("Failed to fetch ready packages:", res.err);
        }
      });
    },
    { defer: true }
  ));

  // Runs catalogue: the same shape (the broadcast is a data-free nonce — run
  // labels must not fan out, Q-B). Also tracks the user's OWN entitlement, so
  // a mid-session grant fetches the catalogue and a revocation clears it — no
  // reconnect needed. defer: true skips only the mount-time run; the server
  // stamps a FRESH nonce in every `starting` payload, so this refetches after
  // every reconnect — DELIBERATE, the self-healing path for backfill runs and
  // missed signals (the payload fill prevents an empty flash while it
  // resolves).
  createEffect(on(
    () => [instanceState.runsCatalogSignal, canSeeRunsCatalog()] as const,
    () => {
      const controller = new AbortController();
      onCleanup(() => controller.abort());

      if (!canSeeRunsCatalog()) {
        updateInstanceRunsCatalog([]);
        return;
      }
      serverActions.listRunCatalog({}).then((res) => {
        if (controller.signal.aborted) return;
        if (res.success) {
          updateInstanceRunsCatalog(res.data);
        } else {
          console.error("Failed to fetch runs catalog:", res.err);
        }
      });
    },
    { defer: true }
  ));

  return (
    <Show
      when={instanceState.isReady}
      fallback={
        <Show
          when={connectionDown()}
          fallback={
            <div class="ui-pad">{t3({ en: "Loading...", fr: "Chargement...", pt: "A carregar..." })}</div>
          }
        >
          <div class="flex h-full w-full items-center justify-center">
            <div class="text-danger">
              {t3({
                en: "Failed to connect to server. Retrying...",
                fr: "Échec de la connexion au serveur. Nouvelle tentative...",
                pt: "Falha na ligação ao servidor. A tentar novamente...",
              })}
            </div>
          </div>
        </Show>
      }
    >
      {/* Post-ready disconnect: stale-visible-while-reconnecting is the
          documented instance behavior — a slim banner OVER the children, never
          a replacement (isReady is never unset on a same-user reconnect). */}
      <Show when={connectionDown()}>
        <div class="bg-danger text-danger-content fixed inset-x-0 top-0 z-50 py-1 text-center text-sm">
          {t3({
            en: "Connection lost — reconnecting...",
            fr: "Connexion perdue — reconnexion...",
            pt: "Ligação perdida — a restabelecer...",
          })}
        </div>
      </Show>
      {p.children}
    </Show>
  );
}
