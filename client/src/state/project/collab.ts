import {
  type CollabClientMessage,
  type CollabServerMessage,
  parseJsonOrThrow,
  type PresenceEntry,
  type PresenceView,
} from "lib";
import { createStore } from "solid-js/store";
import { _SERVER_HOST } from "~/server_actions";

// Client manager for the per-project collaboration WebSocket (Milestone 1:
// presence). Mirrors the SSE manager (t1_sse.tsx): a single module-level
// connection, exponential-backoff reconnect, and a reactive store consumers
// read from. The `peers` list includes self; UI filters by `connectionId`.

type CollabState = {
  connectionId: string | null;
  peers: PresenceEntry[];
};

const [collabStore, setCollabStore] = createStore<CollabState>({
  connectionId: null,
  peers: [],
});

/** Reactive presence state for the current project (includes self). */
export const collabState = collabStore;

/** Peers other than this client, for rendering. */
export function otherPeers(): PresenceEntry[] {
  const self = collabStore.connectionId;
  return collabStore.peers.filter((p) => p.connectionId !== self);
}

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30000;

let ws: WebSocket | null = null;
let currentProjectId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let attempts = 0;
let intentionalClose = false;

// Local presence, re-sent on every (re)connect.
let avatarUrl: string | undefined;
let view: { deckId?: string; slideId?: string; selectedBlockId?: string } = {};

function collabWsUrl(projectId: string): string {
  // _SERVER_HOST is "" in production (same origin) and an http URL in dev.
  const origin = _SERVER_HOST || globalThis.location.origin;
  return origin.replace(/^http/, "ws") + `/project_collab/${projectId}`;
}

function sendPresence(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const message: CollabClientMessage = {
    type: "presence_update",
    data: { avatarUrl, ...view } satisfies PresenceView,
  };
  ws.send(JSON.stringify(message));
}

function openSocket(projectId: string): void {
  intentionalClose = false;
  const socket = new WebSocket(collabWsUrl(projectId));
  ws = socket;

  socket.onopen = () => {
    attempts = 0;
    sendPresence();
  };

  socket.onmessage = (event) => {
    let msg: CollabServerMessage;
    try {
      msg = parseJsonOrThrow<CollabServerMessage>(event.data);
    } catch {
      return;
    }
    if (msg.type === "hello") {
      setCollabStore("connectionId", msg.data.connectionId);
    } else if (msg.type === "presence_state") {
      setCollabStore("peers", msg.data.peers);
    }
  };

  socket.onclose = () => {
    if (ws === socket) ws = null;
    if (!intentionalClose) scheduleReconnect();
  };

  socket.onerror = () => {
    socket.close();
  };
}

function scheduleReconnect(): void {
  if (!currentProjectId) return;
  attempts += 1;
  if (attempts > MAX_RECONNECT_ATTEMPTS) return;
  const delay = Math.min(BASE_RETRY_DELAY * 2 ** attempts, MAX_RETRY_DELAY);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const projectId = currentProjectId;
  reconnectTimer = setTimeout(() => {
    if (currentProjectId === projectId) openSocket(projectId);
  }, delay);
}

function hardClose(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    intentionalClose = true;
    ws.close();
    ws = null;
  }
}

export function connectCollab(projectId: string): void {
  if (
    currentProjectId === projectId && ws && ws.readyState <= WebSocket.OPEN
  ) {
    return;
  }
  hardClose();
  currentProjectId = projectId;
  attempts = 0;
  setCollabStore({ connectionId: null, peers: [] });
  openSocket(projectId);
}

export function disconnectCollab(): void {
  hardClose();
  currentProjectId = null;
  attempts = 0;
  avatarUrl = undefined;
  view = {};
  setCollabStore({ connectionId: null, peers: [] });
}

/** Set this client's avatar once (it persists across reconnects). */
export function setCollabAvatar(url: string | undefined): void {
  avatarUrl = url;
  sendPresence();
}

/** Replace the "what am I looking at" fields wholesale and broadcast. */
export function setCollabView(next: {
  deckId?: string;
  slideId?: string;
  selectedBlockId?: string;
}): void {
  view = next;
  sendPresence();
}
