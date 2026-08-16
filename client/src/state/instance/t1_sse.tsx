import type { InstanceSseMessage, RunProgress } from "lib";
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
  updateInstanceProjects,
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
  updateProjectsLastUpdated,
} from "./t1_store";

// Live results-package generation (Q-B): ephemeral execution state, not T1 —
// like the project channel's copies these go to listeners and never touch
// the store. (The catalogue LISTING is T1 via the projects pattern:
// `runs_catalog_updated` is a data-free timestamp and the boundary below
// fetches `runsCatalog` per user.) The server only sends these two to
// can_configure_data users, so a non-admin's listeners simply never fire.
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
        initInstanceState(msg.data);
        preloadGeoJson(msg.data.geojsonMaps);
        break;
      case "config_updated":
        updateInstanceConfig(msg.data);
        break;
      case "projects_last_updated":
        updateProjectsLastUpdated(msg.data);
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
  setConnectionDown(false);
  resetInstanceState();
}

// ============================================================================
// Boundary component
// ============================================================================

export function InstanceSSEBoundary(p: { children: JSX.Element }) {
  onMount(() => connectInstanceSSE());
  onCleanup(() => disconnectInstanceSSE());

  // Refetch projects when version changes
  // defer: true skips initial run (starting message already has correct projects)
  // AbortController tracks staleness - tryCatchServer doesn't support external abort,
  // but we check aborted flag before updating state to ignore stale responses
  createEffect(on(
    () => instanceState.projectsLastUpdated,
    () => {
      const controller = new AbortController();
      onCleanup(() => controller.abort());

      serverActions.getMyProjects({}).then((res) => {
        if (controller.signal.aborted) return;
        if (res.success) {
          updateInstanceProjects(res.data);
        } else {
          console.error("Failed to fetch projects:", res.err);
        }
      });
    },
    { defer: true }
  ));

  // Runs catalogue: same shape as the projects fetch above (the broadcast is
  // a data-free nonce — run labels must not fan out, Q-B). Also tracks
  // the user's OWN entitlement, so a mid-session grant fetches the catalogue
  // and a revocation clears it — no reconnect needed. defer: true skips only
  // the mount-time run; the server stamps a FRESH nonce in every `starting`
  // payload, so this refetches after every reconnect — DELIBERATE, the
  // self-healing path for backfill runs and missed signals (the payload fill
  // prevents an empty flash while it resolves).
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
