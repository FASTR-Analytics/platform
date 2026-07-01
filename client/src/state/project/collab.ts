import {
  base64ToBytes,
  bytesToBase64,
  type CollabClientMessage,
  type CollabServerMessage,
  parseJsonOrThrow,
  type PresenceEntry,
  type PresenceView,
  type Slide,
  syncSlideToDoc,
} from "lib";
import * as Y from "yjs";
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
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

// ── Slide CRDT sessions (Milestone 3) ───────────────────────────────────────
// Each open slide editor gets a client Y.Doc synced to the server's
// authoritative room over this same WebSocket. Updates applied from the server
// carry SLIDE_REMOTE_ORIGIN so the doc's update handler doesn't echo them back.

const SLIDE_REMOTE_ORIGIN = "remote-server";
const AWARENESS_REMOTE_ORIGIN = "awareness-remote";

type InternalSlideSession = {
  slideId: string;
  doc: Y.Doc;
  awareness: Awareness;
  ready: boolean;
  onRemote: () => void;
  onError?: (message: string) => void;
};

const slideSessions = new Map<string, InternalSlideSession>();

/** Handle to a live slide document, returned by openSlideSession. */
export type SlideSession = {
  doc: Y.Doc;
  /** Yjs awareness for this slide — carries local + remote cursor/selection. */
  awareness: Awareness;
  isReady: () => boolean;
  /** Diff the editor's working slide onto the shared doc (mergeable ops). */
  pushLocal: (slide: Slide) => void;
  close: () => void;
};

/** This client's server-stamped identity, from its own presence entry. */
function selfIdentity(): { name: string; color: string } | null {
  const self = collabStore.peers.find(
    (p) => p.connectionId === collabStore.connectionId,
  );
  return self ? { name: self.name, color: self.color } : null;
}

function applySessionUser(awareness: Awareness): void {
  const id = selfIdentity();
  if (id) {
    awareness.setLocalStateField("user", {
      name: id.name,
      color: id.color,
      colorLight: id.color,
    });
  }
}

function sendCollab(msg: CollabClientMessage): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(msg));
  return true;
}

function subscribeSlideOnSocket(s: InternalSlideSession): void {
  sendCollab({
    type: "slide_subscribe",
    data: { slideId: s.slideId, stateVector: bytesToBase64(Y.encodeStateVector(s.doc)) },
  });
}

function destroySlideSession(s: InternalSlideSession): void {
  slideSessions.delete(s.slideId);
  try {
    removeAwarenessStates(s.awareness, [s.awareness.clientID], "local");
    s.awareness.destroy();
  } catch {
    // ignore
  }
  try {
    s.doc.destroy();
  } catch {
    // ignore
  }
}

export function openSlideSession(
  slideId: string,
  onRemote: () => void,
  onError?: (message: string) => void,
): SlideSession {
  const prior = slideSessions.get(slideId);
  if (prior) destroySlideSession(prior);

  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  applySessionUser(awareness);
  const s: InternalSlideSession = {
    slideId,
    doc,
    awareness,
    ready: false,
    onRemote,
    onError,
  };
  slideSessions.set(slideId, s);

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    // Updates applied from the server must not be shipped back.
    if (origin === SLIDE_REMOTE_ORIGIN) return;
    sendCollab({ type: "slide_update", data: { slideId, update: bytesToBase64(update) } });
  });

  awareness.on(
    "update",
    (
      changes: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      // Don't re-ship awareness that was just applied from the server.
      if (origin === AWARENESS_REMOTE_ORIGIN) return;
      const changed = [
        ...changes.added,
        ...changes.updated,
        ...changes.removed,
      ];
      const update = encodeAwarenessUpdate(awareness, changed);
      sendCollab({
        type: "awareness_update",
        data: { slideId, update: bytesToBase64(update) },
      });
    },
  );

  // Subscribe now if connected; otherwise socket.onopen re-subscribes all.
  subscribeSlideOnSocket(s);

  return {
    doc,
    awareness,
    isReady: () => s.ready,
    pushLocal: (slide: Slide) => {
      if (!s.ready) return;
      doc.transact(() => syncSlideToDoc(doc, slide));
    },
    close: () => closeSlideSession(slideId),
  };
}

export function closeSlideSession(slideId: string): void {
  const s = slideSessions.get(slideId);
  if (!s) return;
  sendCollab({ type: "slide_unsubscribe", data: { slideId } });
  destroySlideSession(s);
}

function handleSlideServerMessage(msg: CollabServerMessage): boolean {
  if (msg.type === "slide_sync") {
    const s = slideSessions.get(msg.data.slideId);
    if (s) {
      Y.applyUpdate(s.doc, base64ToBytes(msg.data.update), SLIDE_REMOTE_ORIGIN);
      s.ready = true;
      s.onRemote();
    }
    return true;
  }
  if (msg.type === "slide_update") {
    const s = slideSessions.get(msg.data.slideId);
    if (s) {
      Y.applyUpdate(s.doc, base64ToBytes(msg.data.update), SLIDE_REMOTE_ORIGIN);
      s.onRemote();
    }
    return true;
  }
  if (msg.type === "slide_error") {
    slideSessions.get(msg.data.slideId)?.onError?.(msg.data.message);
    return true;
  }
  if (msg.type === "awareness") {
    const s = slideSessions.get(msg.data.slideId);
    if (s) {
      applyAwarenessUpdate(
        s.awareness,
        base64ToBytes(msg.data.update),
        AWARENESS_REMOTE_ORIGIN,
      );
    }
    return true;
  }
  return false;
}

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
    // Re-subscribe any open slide sessions (covers first connect + reconnect:
    // the server sends only what each doc's state vector is missing).
    for (const s of slideSessions.values()) subscribeSlideOnSocket(s);
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
      // Our identity (name/color) may have just arrived — stamp it on any open
      // session's awareness so remote peers see a labelled cursor.
      for (const s of slideSessions.values()) applySessionUser(s.awareness);
    } else {
      handleSlideServerMessage(msg);
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
  for (const s of [...slideSessions.values()]) destroySlideSession(s);
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
