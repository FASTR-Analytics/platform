import { type LastUpdateTableName, type ProjectSseMessage, parseJsonOrThrow, t3 } from "lib";
import { Button } from "panther";
import { type JSX, Show, createSignal, onCleanup, onMount } from "solid-js";
import { _SERVER_HOST } from "~/server_actions";
import {
  applyProjectSseMessage,
  projectState,
  resetProjectState,
} from "./t1_store";

const MAX_CONNECTION_ATTEMPTS = 3;
const BASE_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30000;

type LastUpdatedListener = (
  tableName: LastUpdateTableName,
  ids: string[],
  timestamp: string
) => void;

type RScriptListener = (moduleId: string, text: string) => void;

const lastUpdatedListeners = new Set<LastUpdatedListener>();
const rScriptListeners = new Set<RScriptListener>();

let evtSource: EventSource | null = null;
let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
let connectionAttempts = 0;
let currentProjectId: string | null = null;

export function addLastUpdatedListener(listener: LastUpdatedListener): () => void {
  lastUpdatedListeners.add(listener);
  return () => lastUpdatedListeners.delete(listener);
}

export function addRScriptListener(listener: RScriptListener): () => void {
  rScriptListeners.add(listener);
  return () => rScriptListeners.delete(listener);
}

function fireLastUpdatedListeners(
  tableName: LastUpdateTableName,
  ids: string[],
  timestamp: string
): void {
  for (const listener of lastUpdatedListeners) {
    listener(tableName, ids, timestamp);
  }
}

function fireRScriptListeners(moduleId: string, text: string): void {
  for (const listener of rScriptListeners) {
    listener(moduleId, text);
  }
}

function getRetryDelay(attempt: number): number {
  return Math.min(BASE_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);
}

export function connectProjectSSE(projectId: string): void {
  if (evtSource && evtSource.readyState !== EventSource.CLOSED) {
    if (currentProjectId === projectId) {
      return;
    }
    disconnectProjectSSE();
  }

  currentProjectId = projectId;
  connectionAttempts++;

  const url = `${_SERVER_HOST}/project_sse_v2/${projectId}`;
  console.log("Connecting to SSE v2:", url);

  evtSource = new EventSource(url, { withCredentials: true });

  evtSource.onopen = () => {
    connectionAttempts = 0;
  };

  evtSource.onmessage = (event) => {
    let msg: ProjectSseMessage;
    try {
      msg = parseJsonOrThrow<ProjectSseMessage>(event.data);
    } catch (error) {
      console.error("Failed to parse SSE message:", error, "Raw:", event.data);
      return;
    }

    if (msg.type === "r_script") {
      fireRScriptListeners(msg.data.moduleId, msg.data.text);
      return;
    }

    if (msg.type === "last_updated") {
      fireLastUpdatedListeners(msg.data.tableName, msg.data.ids, msg.data.lastUpdated);
    }

    applyProjectSseMessage(msg);
  };

  evtSource.onerror = () => {
    console.warn("EventSource error, readyState:", evtSource?.readyState);

    if (evtSource) {
      evtSource.close();
      evtSource = null;
    }

    if (connectionAttempts <= MAX_CONNECTION_ATTEMPTS && currentProjectId) {
      retryProjectSSE();
    }
  };
}

function retryProjectSSE(): void {
  if (connectionAttempts > MAX_CONNECTION_ATTEMPTS || !currentProjectId) {
    return;
  }

  const delay = getRetryDelay(connectionAttempts);
  console.log(`Retrying SSE v2 in ${delay}ms (attempt ${connectionAttempts})`);

  if (retryTimeoutId) {
    clearTimeout(retryTimeoutId);
  }

  const projectId = currentProjectId;
  retryTimeoutId = setTimeout(() => connectProjectSSE(projectId), delay);
}

export function disconnectProjectSSE(): void {
  if (retryTimeoutId) {
    clearTimeout(retryTimeoutId);
    retryTimeoutId = null;
  }

  if (evtSource) {
    evtSource.close();
    evtSource = null;
  }

  currentProjectId = null;
  connectionAttempts = 0;
  lastUpdatedListeners.clear();
  rScriptListeners.clear();
  resetProjectState();
}

export function getConnectionAttempts(): number {
  return connectionAttempts;
}

type ProjectSSEBoundaryProps = {
  projectId: string;
  children: JSX.Element;
};

export function ProjectSSEBoundary(props: ProjectSSEBoundaryProps) {
  const [connectAttempts, setConnectAttempts] = createSignal(0);

  onMount(() => {
    connectProjectSSE(props.projectId);
    const interval = setInterval(() => {
      setConnectAttempts(connectionAttempts);
    }, 100);
    onCleanup(() => clearInterval(interval));
  });

  onCleanup(() => {
    disconnectProjectSSE();
  });

  return (
    <Show
      when={connectAttempts() <= MAX_CONNECTION_ATTEMPTS}
      fallback={
        <div class="ui-pad ui-spy-sm">
          <div>{t3({ en: "Cannot connect to project.", fr: "Impossible de se connecter au projet." })}</div>
          <div>
            <Button href="/">{t3({ en: "Go home", fr: "Retour à l'accueil" })}</Button>
          </div>
        </div>
      }
    >
      <Show
        when={projectState.isReady}
        fallback={
          <div class="ui-pad">
            {t3({ en: "Connecting to project", fr: "Connexion au projet" })}
            {connectAttempts() > 1
              ? ` (${t3({ en: "retrying", fr: "réessayer" })} ${connectAttempts() - 1})`
              : ""}
            ...
          </div>
        }
      >
        {props.children}
      </Show>
    </Show>
  );
}
