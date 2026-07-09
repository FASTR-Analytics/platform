import {
  base64ToBytes,
  bytesToBase64,
  type CollabClientMessage,
  type CollabServerMessage,
  parseJsonOrThrow,
  PO_CONFIG_MAP_KEY,
  type PresenceEntry,
  type PresentationObjectConfig,
  type PresenceView,
  type ReportDocContent,
  type Slide,
  type SyncReportOpts,
  type SyncSlideOpts,
  syncFigureConfigToMap,
  syncReportRegistries,
  syncReportToDoc,
  syncSlideToDoc,
} from "lib";
import * as Y from "yjs";
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { _SERVER_HOST } from "~/server_actions";
import {
  notifyPresenceToasts,
  resetPresenceToasts,
} from "~/components/_shared/presence_toasts";
import { notifyCollabConnection } from "~/components/_shared/connection_banner";

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

// Reactive "is the collab socket open right now" — for UI (live/offline save
// indicators). Session isLive() reads the raw socket for save decisions; this
// signal exists because ws.readyState isn't reactive.
const [socketOpen, setSocketOpen] = createSignal(false);
export const collabSocketOpen = socketOpen;

// Reconnects never give up: `attempts` only grows the backoff (capped at
// MAX_RETRY_DELAY, exponent clamped so 2**attempts can't overflow on long
// outages). The connection banner tells the user while retries run, and the
// online/visibilitychange listeners below short-circuit the wait as soon as
// the network or tab plausibly comes back.
const RETRY_EXPONENT_CAP = 5;
const BASE_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30000;

let ws: WebSocket | null = null;
let currentProjectId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let attempts = 0;
// Close-intent is tracked PER SOCKET, not as a module flag: a project switch
// closes the old socket and immediately opens a new one, and the old socket's
// onclose fires only later — a shared flag reset by openSocket would then read
// "unintentional" and schedule a spurious duplicate reconnect.
const intentionallyClosed = new WeakSet<WebSocket>();

// Local presence, re-sent on every (re)connect.
let avatarUrl: string | undefined;
let view: {
  deckId?: string;
  slideId?: string;
  selectedBlockId?: string;
  selectedTextTarget?: string;
  reportId?: string;
  poId?: string;
  editingFigureId?: string;
} = {};

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
  /**
   * Ready AND the socket is currently open — i.e. collab is actually
   * persisting edits right now. False while disconnected even though local
   * edits still accumulate in the session doc (the reconnect catch-up ships
   * them IF a reconnect happens); closing the editor in that state must flush
   * explicitly or the un-shipped edits die with the doc.
   */
  isLive: () => boolean;
  /** Diff the editor's working slide onto the shared doc (mergeable ops). `opts`
   *  lets a host with an open figure-editor modal exclude that figure's config
   *  from the push (the modal owns it live). */
  pushLocal: (slide: Slide, opts?: SyncSlideOpts) => void;
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
      // Selection-highlight color: y-codemirror paints the peer's selected
      // RANGE with this as the background, so it must be translucent — the
      // opaque presence color would black out the selected text. "33" = ~20%
      // alpha on the hex color, matching the library's own fallback.
      colorLight: id.color + "33",
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
    isLive: () => s.ready && !!ws && ws.readyState === WebSocket.OPEN,
    pushLocal: (slide: Slide, opts?: SyncSlideOpts) => {
      if (!s.ready) return;
      doc.transact(() => syncSlideToDoc(doc, slide, opts));
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

// ── Report CRDT sessions ─────────────────────────────────────────────────────
// Mirrors the slide sessions above, over the report_* message family. The body
// is edited through a yCollab CodeMirror binding on the doc's Y.Text; the
// figure/image registries are pushed via pushRegistries; pushLocal exists only
// for the first-sync merge (before the editor binds).

type InternalReportSession = {
  reportId: string;
  doc: Y.Doc;
  awareness: Awareness;
  ready: boolean;
  onRemote: () => void;
  onError?: (message: string) => void;
};

const reportSessions = new Map<string, InternalReportSession>();

/** Handle to a live report document, returned by openReportSession. */
export type ReportSession = {
  doc: Y.Doc;
  /** Yjs awareness for this report — carries local + remote cursor/selection. */
  awareness: Awareness;
  isReady: () => boolean;
  /** Ready AND the socket is currently open — see SlideSession.isLive. */
  isLive: () => boolean;
  /** Diff full content onto the shared doc — first-sync merge only. */
  pushLocal: (content: ReportDocContent) => void;
  /** Diff the figure/image registries onto the shared doc. `opts` lets a host
   *  with an open figure-editor modal exclude that figure's config (modal owns
   *  it live). */
  pushRegistries: (
    figures: ReportDocContent["figures"],
    images: ReportDocContent["images"],
    opts?: SyncReportOpts,
  ) => void;
  close: () => void;
};

function subscribeReportOnSocket(s: InternalReportSession): void {
  sendCollab({
    type: "report_subscribe",
    data: {
      reportId: s.reportId,
      stateVector: bytesToBase64(Y.encodeStateVector(s.doc)),
    },
  });
}

function destroyReportSession(s: InternalReportSession): void {
  reportSessions.delete(s.reportId);
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

export function openReportSession(
  reportId: string,
  onRemote: () => void,
  onError?: (message: string) => void,
): ReportSession {
  const prior = reportSessions.get(reportId);
  if (prior) destroyReportSession(prior);

  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  applySessionUser(awareness);
  const s: InternalReportSession = {
    reportId,
    doc,
    awareness,
    ready: false,
    onRemote,
    onError,
  };
  reportSessions.set(reportId, s);

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    // Updates applied from the server must not be shipped back.
    if (origin === SLIDE_REMOTE_ORIGIN) return;
    sendCollab({
      type: "report_update",
      data: { reportId, update: bytesToBase64(update) },
    });
  });

  awareness.on(
    "update",
    (
      changes: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin === AWARENESS_REMOTE_ORIGIN) return;
      const changed = [
        ...changes.added,
        ...changes.updated,
        ...changes.removed,
      ];
      const update = encodeAwarenessUpdate(awareness, changed);
      sendCollab({
        type: "report_awareness_update",
        data: { reportId, update: bytesToBase64(update) },
      });
    },
  );

  // Subscribe now if connected; otherwise socket.onopen re-subscribes all.
  subscribeReportOnSocket(s);

  return {
    doc,
    awareness,
    isReady: () => s.ready,
    isLive: () => s.ready && !!ws && ws.readyState === WebSocket.OPEN,
    pushLocal: (content: ReportDocContent) => {
      if (!s.ready) return;
      doc.transact(() => syncReportToDoc(doc, content));
    },
    pushRegistries: (figures, images, opts) => {
      if (!s.ready) return;
      doc.transact(() => syncReportRegistries(doc, figures, images, opts));
    },
    close: () => closeReportSession(reportId),
  };
}

export function closeReportSession(reportId: string): void {
  const s = reportSessions.get(reportId);
  if (!s) return;
  sendCollab({ type: "report_unsubscribe", data: { reportId } });
  destroyReportSession(s);
}

// ── Visualization (presentation object) CRDT sessions ────────────────────────
// Mirrors the report sessions over the po_* message family. The editor binds its
// form to the config Y.Map via the figure-config bridge; caption Y.Texts are
// bound with yCollab CodeMirrors. Local edits transact with `localOrigin` so a
// per-editor Y.UndoManager can track only this user's changes.

type InternalPoSession = {
  poId: string;
  doc: Y.Doc;
  awareness: Awareness;
  localOrigin: object;
  ready: boolean;
  onRemote: () => void;
  onError?: (message: string) => void;
};

const poSessions = new Map<string, InternalPoSession>();

/** Handle to a live visualization config document, returned by openPoSession. */
export type PoSession = {
  doc: Y.Doc;
  /** The config root Y.Map — bind the editor form + caption CodeMirrors here. */
  configMap: Y.Map<unknown>;
  /** Yjs awareness for this visualization — local + remote carets/selection. */
  awareness: Awareness;
  /** Transaction origin for this client's local writes — pass to Y.UndoManager
   *  `trackedOrigins` so undo/redo only affects this user's edits. */
  localOrigin: object;
  isReady: () => boolean;
  /** Ready AND the socket is currently open — see SlideSession.isLive. */
  isLive: () => boolean;
  /** Diff the editor's working config onto the shared doc (mergeable ops). */
  pushLocal: (config: PresentationObjectConfig) => void;
  close: () => void;
};

function subscribePoOnSocket(s: InternalPoSession): void {
  sendCollab({
    type: "po_subscribe",
    data: { poId: s.poId, stateVector: bytesToBase64(Y.encodeStateVector(s.doc)) },
  });
}

function destroyPoSession(s: InternalPoSession): void {
  poSessions.delete(s.poId);
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

export function openPoSession(
  poId: string,
  onRemote: () => void,
  onError?: (message: string) => void,
): PoSession {
  const prior = poSessions.get(poId);
  if (prior) destroyPoSession(prior);

  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  applySessionUser(awareness);
  const s: InternalPoSession = {
    poId,
    doc,
    awareness,
    localOrigin: {},
    ready: false,
    onRemote,
    onError,
  };
  poSessions.set(poId, s);

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    // Updates applied from the server must not be shipped back.
    if (origin === SLIDE_REMOTE_ORIGIN) return;
    sendCollab({
      type: "po_update",
      data: { poId, update: bytesToBase64(update) },
    });
  });

  awareness.on(
    "update",
    (
      changes: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin === AWARENESS_REMOTE_ORIGIN) return;
      const changed = [
        ...changes.added,
        ...changes.updated,
        ...changes.removed,
      ];
      const update = encodeAwarenessUpdate(awareness, changed);
      sendCollab({
        type: "po_awareness_update",
        data: { poId, update: bytesToBase64(update) },
      });
    },
  );

  subscribePoOnSocket(s);

  return {
    doc,
    configMap: doc.getMap<unknown>(PO_CONFIG_MAP_KEY),
    awareness,
    localOrigin: s.localOrigin,
    isReady: () => s.ready,
    isLive: () => s.ready && !!ws && ws.readyState === WebSocket.OPEN,
    pushLocal: (config: PresentationObjectConfig) => {
      if (!s.ready) return;
      doc.transact(
        () => syncFigureConfigToMap(doc.getMap<unknown>(PO_CONFIG_MAP_KEY), config),
        s.localOrigin,
      );
    },
    close: () => closePoSession(poId),
  };
}

export function closePoSession(poId: string): void {
  const s = poSessions.get(poId);
  if (!s) return;
  sendCollab({ type: "po_unsubscribe", data: { poId } });
  destroyPoSession(s);
}

function handlePoServerMessage(msg: CollabServerMessage): boolean {
  if (msg.type === "po_sync") {
    const s = poSessions.get(msg.data.poId);
    if (s) {
      Y.applyUpdate(s.doc, base64ToBytes(msg.data.update), SLIDE_REMOTE_ORIGIN);
      s.ready = true;
      // Two-way sync: push anything the server is missing (guarded — a
      // missing/malformed stateVector must not break onRemote).
      try {
        if (msg.data.stateVector) {
          const diff = Y.encodeStateAsUpdate(
            s.doc,
            base64ToBytes(msg.data.stateVector),
          );
          if (diff.length > 2) {
            sendCollab({
              type: "po_update",
              data: { poId: msg.data.poId, update: bytesToBase64(diff) },
            });
          }
        }
      } catch {
        // Skip the catch-up; the next local edit's push re-syncs anyway.
      }
      s.onRemote();
    }
    return true;
  }
  if (msg.type === "po_update") {
    const s = poSessions.get(msg.data.poId);
    if (s) {
      Y.applyUpdate(s.doc, base64ToBytes(msg.data.update), SLIDE_REMOTE_ORIGIN);
      s.onRemote();
    }
    return true;
  }
  if (msg.type === "po_error") {
    poSessions.get(msg.data.poId)?.onError?.(msg.data.message);
    return true;
  }
  if (msg.type === "po_awareness") {
    const s = poSessions.get(msg.data.poId);
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

function handleReportServerMessage(msg: CollabServerMessage): boolean {
  if (msg.type === "report_sync") {
    const s = reportSessions.get(msg.data.reportId);
    if (s) {
      Y.applyUpdate(s.doc, base64ToBytes(msg.data.update), SLIDE_REMOTE_ORIGIN);
      s.ready = true;
      // Two-way sync: push anything the server is missing (guarded like the
      // slide path — a missing/malformed stateVector must not break onRemote).
      try {
        if (msg.data.stateVector) {
          const diff = Y.encodeStateAsUpdate(
            s.doc,
            base64ToBytes(msg.data.stateVector),
          );
          if (diff.length > 2) {
            sendCollab({
              type: "report_update",
              data: { reportId: msg.data.reportId, update: bytesToBase64(diff) },
            });
          }
        }
      } catch {
        // Skip the catch-up; the next local edit's push re-syncs anyway.
      }
      s.onRemote();
    }
    return true;
  }
  if (msg.type === "report_update") {
    const s = reportSessions.get(msg.data.reportId);
    if (s) {
      Y.applyUpdate(s.doc, base64ToBytes(msg.data.update), SLIDE_REMOTE_ORIGIN);
      s.onRemote();
    }
    return true;
  }
  if (msg.type === "report_error") {
    reportSessions.get(msg.data.reportId)?.onError?.(msg.data.message);
    return true;
  }
  if (msg.type === "report_awareness") {
    const s = reportSessions.get(msg.data.reportId);
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

function handleSlideServerMessage(msg: CollabServerMessage): boolean {
  if (msg.type === "slide_sync") {
    const s = slideSessions.get(msg.data.slideId);
    if (s) {
      Y.applyUpdate(s.doc, base64ToBytes(msg.data.update), SLIDE_REMOTE_ORIGIN);
      s.ready = true;
      // Two-way sync: push anything the server is missing — e.g. a local edit
      // whose slide_update was lost before this (re)connect (a switched viz that
      // updated locally but never reached the server). The diff carries just the
      // missing ops, not the whole doc; skip it when already in sync. Guarded:
      // a slide_sync without a (valid) stateVector — e.g. an older server build
      // during a deploy/rollback — must never break onRemote below.
      try {
        if (msg.data.stateVector) {
          const diff = Y.encodeStateAsUpdate(
            s.doc,
            base64ToBytes(msg.data.stateVector),
          );
          if (diff.length > 2) {
            sendCollab({
              type: "slide_update",
              data: { slideId: msg.data.slideId, update: bytesToBase64(diff) },
            });
          }
        }
      } catch {
        // Malformed state vector: skip the catch-up; the next local edit's
        // full-slide push re-syncs anyway.
      }
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
  const socket = new WebSocket(collabWsUrl(projectId));
  ws = socket;

  socket.onopen = () => {
    attempts = 0;
    setSocketOpen(true);
    notifyCollabConnection("connected");
    sendPresence();
    // Re-subscribe any open sessions (covers first connect + reconnect:
    // the server sends only what each doc's state vector is missing).
    for (const s of slideSessions.values()) subscribeSlideOnSocket(s);
    for (const s of reportSessions.values()) subscribeReportOnSocket(s);
    for (const s of poSessions.values()) subscribePoOnSocket(s);
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
      for (const s of reportSessions.values()) applySessionUser(s.awareness);
      for (const s of poSessions.values()) applySessionUser(s.awareness);
      // "Alice joined this deck" toasts — scoped to the doc I'm currently in.
      notifyPresenceToasts(msg.data.peers, collabStore.connectionId, view);
    } else if (
      !handleSlideServerMessage(msg) && !handleReportServerMessage(msg)
    ) {
      handlePoServerMessage(msg);
    }
  };

  socket.onclose = () => {
    const intentional = intentionallyClosed.has(socket);
    if (ws === socket) {
      ws = null;
      setSocketOpen(false);
    }
    if (!intentional) {
      notifyCollabConnection("reconnecting");
      scheduleReconnect();
    }
  };

  socket.onerror = () => {
    socket.close();
  };
}

function scheduleReconnect(): void {
  if (!currentProjectId) return;
  attempts += 1;
  const delay = Math.min(
    BASE_RETRY_DELAY * 2 ** Math.min(attempts, RETRY_EXPONENT_CAP),
    MAX_RETRY_DELAY,
  );
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const projectId = currentProjectId;
  reconnectTimer = setTimeout(() => {
    if (currentProjectId === projectId) openSocket(projectId);
  }, delay);
}

// Reconnect NOW when the network or the tab plausibly came back — skips the
// (up to 30s) backoff wait. Registered once for the module's lifetime; no-ops
// when no project wants a connection or the socket is already up/connecting.
function retryNow(): void {
  if (!currentProjectId) return;
  if (ws && ws.readyState <= WebSocket.OPEN) return; // CONNECTING or OPEN
  attempts = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  openSocket(currentProjectId);
}
window.addEventListener("online", retryNow);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") retryNow();
});

function hardClose(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    intentionallyClosed.add(ws);
    ws.close();
    ws = null;
    setSocketOpen(false);
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
  // Initial connect (not a drop) — the banner stays hidden in this state; a
  // failure moves it to "reconnecting" via onclose.
  notifyCollabConnection("connecting");
  openSocket(projectId);
}

export function disconnectCollab(): void {
  hardClose();
  for (const s of [...slideSessions.values()]) destroySlideSession(s);
  for (const s of [...reportSessions.values()]) destroyReportSession(s);
  for (const s of [...poSessions.values()]) destroyPoSession(s);
  resetPresenceToasts();
  notifyCollabConnection("idle");
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
  selectedTextTarget?: string;
  reportId?: string;
  poId?: string;
  editingFigureId?: string;
}): void {
  view = next;
  sendPresence();
}
