import type { InstanceSseMessage } from "lib";
import { t3 } from "lib";
import { Show, on, createEffect, type JSX } from "solid-js";
import { onMount, onCleanup, createSignal } from "solid-js";
import { _SERVER_HOST, fetchMyProjects } from "~/server_actions";
import { preloadGeoJson } from "~/state/instance/t2_geojson";
import {
  instanceState,
  initInstanceState,
  updateInstanceConfig,
  updateInstanceProjects,
  updateInstanceUsers,
  updateInstanceAssets,
  updateInstanceGeoJsonMaps,
  updateInstanceStructure,
  updateInstanceIndicators,
  updateInstanceDatasets,
  updateCurrentUser,
  updateProjectsLastUpdated,
} from "./t1_store";

const _MAX_CONNECTION_ATTEMPTS = 5;
const _BASE_RETRY_DELAY = 1000;
const _MAX_RETRY_DELAY = 30000;

function getRetryDelay(attempt: number): number {
  return Math.min(_BASE_RETRY_DELAY * Math.pow(2, attempt), _MAX_RETRY_DELAY);
}

let evtSource: EventSource | null = null;
let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
let connectionAttempts = 0;

const [connectionFailed, setConnectionFailed] = createSignal(false);

export function connectInstanceSSE(): void {
  if (evtSource && evtSource.readyState !== EventSource.CLOSED) {
    return;
  }

  connectionAttempts++;
  const url = `${_SERVER_HOST}/instance_updates`;
  evtSource = new EventSource(url, { withCredentials: true });

  evtSource.onopen = () => {
    connectionAttempts = 0;
    setConnectionFailed(false);
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
      case "geojson_maps_updated":
        updateInstanceGeoJsonMaps(msg.data);
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

    if (connectionAttempts <= _MAX_CONNECTION_ATTEMPTS) {
      const delay = getRetryDelay(connectionAttempts);
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
      retryTimeoutId = setTimeout(connectInstanceSSE, delay);
    } else {
      setConnectionFailed(true);
    }
  };
}

export function disconnectInstanceSSE(): void {
  if (retryTimeoutId) {
    clearTimeout(retryTimeoutId);
    retryTimeoutId = null;
  }
  if (evtSource) {
    evtSource.close();
    evtSource = null;
  }
  connectionAttempts = 0;
}

// ============================================================================
// Boundary component
// ============================================================================

export function InstanceSSEBoundary(props: { children: JSX.Element }) {
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

      fetchMyProjects().then((res) => {
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

  return (
    <Show
      when={instanceState.isReady}
      fallback={
        <Show
          when={connectionFailed()}
          fallback={
            <div class="ui-pad">{t3({ en: "Loading...", fr: "Chargement..." })}</div>
          }
        >
          <div class="flex h-full w-full items-center justify-center">
            <div class="text-error">
              {t3({
                en: "Failed to connect to server. Please refresh the page.",
                fr: "Échec de la connexion au serveur. Veuillez actualiser la page.",
              })}
            </div>
          </div>
        </Show>
      }
    >
      {props.children}
    </Show>
  );
}
