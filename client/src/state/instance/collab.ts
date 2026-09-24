import {
  base64ToBytes,
  bytesToBase64,
  type CollabClientMessage,
  type CollabServerMessage,
  parseJsonOrThrow,
  type PresenceEntry,
  type PresenceView,
  type ReportDocContent,
  type Slide,
  slideDocRoot,
  type SyncReportOpts,
  type SyncSlideOpts,
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
} from "./presence_toasts";
import { notifyCollabConnection } from "./connection_banner";

// Client manager for the instance-wide collaboration WebSocket (GET /collab):
// presence, idle detection, and the two CRDT session families the server
// serves (slide / report) with reconnect catch-up. Mirrors the SSE manager
// (t1_sse.tsx): a single module-level connection, exponential-backoff
// reconnect that never gives up, and a reactive store consumers read from.
// The `peers` list is per CONNECTION and includes self; UI reads it through
// otherPeers(), which collapses it to one entry per person, or
// peersInProduct(id), since presence is keyed by PRODUCT.

type CollabState = {
  connectionId: string | null;
  peers: PresenceEntry[];
};

const [collabStore, setCollabStore] = createStore<CollabState>({
  connectionId: null,
  peers: [],
});

/** Reactive presence state for the instance connection (includes self). */
export const collabState = collabStore;

/** Which connection speaks for a person holding several (two tabs, or a
 *  reconnect overlapping the old socket's teardown): the one actually applying
 *  edits, else one that isn't idle, else the lowest connectionId so every
 *  viewer picks the same one. */
function presenceRank(p: PresenceEntry): number {
  return (p.isEditing ? 2 : 0) + (p.idle ? 0 : 1);
}

/** Other PEOPLE on this instance: one entry each, never one per connection.
 *
 *  Presence is connection-keyed, but every consumer (avatars, viewer chips,
 *  "who has this open" borders, the AI busy-slide guard) is asking about
 *  people: a user with a second tab must not appear twice, and their own tabs
 *  must not appear at all, otherwise you see your own name as a collaborator
 *  and the AI refuses to edit a slide because "you" have it open. Matches the
 *  join/leave toasts, which have always keyed on email, and the live-cursor
 *  overlay, which collapses the same way. */
export function otherPeers(): PresenceEntry[] {
  const self = collabStore.peers.find(
    (p) => p.connectionId === collabStore.connectionId,
  );
  const byPerson = new Map<string, PresenceEntry>();
  for (const p of collabStore.peers) {
    if (p.connectionId === collabStore.connectionId) {
      continue;
    }
    if (self && p.email === self.email) {
      continue;
    }
    const held = byPerson.get(p.email);
    if (
      !held ||
      presenceRank(p) > presenceRank(held) ||
      (presenceRank(p) === presenceRank(held) &&
        p.connectionId < held.connectionId)
    ) {
      byPerson.set(p.email, p);
    }
  }
  return [...byPerson.values()];
}

/** Other people currently inside one product: the socket is instance-wide,
 *  so every header filters the roster down to its own product (presence is
 *  keyed by PRODUCT, and a product id IS its deck/report id). */
export function peersInProduct(productId: string): PresenceEntry[] {
  return otherPeers().filter(
    (p) => p.deckId === productId || p.reportId === productId,
  );
}

/** Connection ids the server currently lists (empty before
 *  presence arrives: treat that as "unknown", never as "nobody"). Reactive.
 *  The cursor overlay uses it to drop awareness states whose connection is
 *  already gone: the server deregisters a connection and rebroadcasts presence
 *  the instant its socket closes, whereas the Yjs awareness liveness sweep
 *  needs ~30 s, long enough for a closed tab to keep a ghost cursor on
 *  everyone's screen. */
export function liveConnectionIds(): ReadonlySet<string> {
  return new Set(collabStore.peers.map((p) => p.connectionId));
}

// Reactive "is the collab socket open right now", for UI (live/offline save
// indicators). Session isLive() reads the raw socket for save decisions; this
// signal exists because ws.readyState isn't reactive.
const [socketOpen, setSocketOpen] = createSignal(false);
export const collabSocketOpen = socketOpen;

// Rooms whose server-side persistence is currently failing, keyed
// `${docType}::${docId}` (doc_save_state messages). Editors read this so their
// save indicator stops claiming "Live" while nothing is actually persisting.
// Reset per doc on every sync (the server re-sends failing state right after
// the sync when it still applies) and when the session closes.
const [saveFailingKeys, setSaveFailingKeys] = createSignal<ReadonlySet<string>>(
  new Set(),
);

function setDocSaveFailing(
  docType: string,
  docId: string,
  failing: boolean,
): void {
  setSaveFailingKeys((prev) => {
    const key = `${docType}::${docId}`;
    if (prev.has(key) === failing) {
      return prev;
    }
    const next = new Set(prev);
    if (failing) {
      next.add(key);
    } else {
      next.delete(key);
    }
    return next;
  });
}

/** Reactive: true while the server room for this document reports failing
 *  checkpoint saves (edits relay live but nothing persists until recovery). */
export function docSaveFailing(
  docType: "slide" | "report",
  docId: string,
): boolean {
  return saveFailingKeys().has(`${docType}::${docId}`);
}

// Reconnects never give up: `attempts` only grows the backoff (capped at
// MAX_RETRY_DELAY, exponent clamped so 2**attempts can't overflow on long
// outages). The connection banner tells the user while retries run, and the
// online/visibilitychange listeners below short-circuit the wait as soon as
// the network or tab plausibly comes back.
//
// The ONE exception is an authorization refusal: the server closes with
// COLLAB_CLOSE_UNAUTHORIZED (4403), or 1008, the standard policy-violation
// code, for a condition no amount of retrying can change. Those stop the loop
// (see `unauthorized`) instead of burning a request every 30s, and on every tab
// refocus, forever.
const RETRY_EXPONENT_CAP = 5;
const BASE_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30000;
const TERMINAL_CLOSE_CODES = new Set([4403, 1008]);

let ws: WebSocket | undefined;
// Is a connection WANTED? There is one socket per signed-in approved user for
// the whole session; the instance boundary opens it on approval.
let wantConnection = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let attempts = 0;
// Latched by a terminal close so nothing re-opens the socket until something
// that could change the answer happens (reconnectCollab).
let unauthorized = false;
// Close-intent is tracked PER SOCKET, not as a module flag: a reconnect
// closes the old socket and immediately opens a new one, and the old socket's
// onclose fires only later: a shared flag reset by openSocket would then read
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
  editingFigureId?: string;
} = {};

// ── Slide CRDT sessions (Milestone 3) ───────────────────────────────────────
// Each open slide editor gets a client Y.Doc synced to the server's
// authoritative room over this same WebSocket. Updates applied from the server
// carry SLIDE_REMOTE_ORIGIN so the doc's update handler doesn't echo them back.

const SLIDE_REMOTE_ORIGIN = "remote-server";
const AWARENESS_REMOTE_ORIGIN = "awareness-remote";
// Origin of the LOCAL removal of a peer's awareness state whose connection the
// server no longer lists (pruneGoneAwareness). Every client prunes on its own
// presence_state, so the removal is never shipped — relaying it would only
// duplicate work peers already did, and could bounce off a still-alive peer
// (a remote removal of one's own state makes y-protocols re-announce it).
const AWARENESS_PRUNE_ORIGIN = "awareness-presence-prune";

/** Awareness "update" events that must NOT be shipped to the server: those
 *  just applied FROM it, and local presence-driven prunes. */
function isLocalOnlyAwarenessOrigin(origin: unknown): boolean {
  return origin === AWARENESS_REMOTE_ORIGIN || origin === AWARENESS_PRUNE_ORIGIN;
}

/** Drop the awareness states of connections the server no longer lists.
 *
 *  A closed socket (tab closed, browser quit, network death reaped by the
 *  server's idleTimeout) removes its connection from presence within a round
 *  trip, but its awareness states — the yCollab text caret, the pointer, the
 *  viz-tab avatar — would otherwise linger on every peer until y-protocols'
 *  ~30 s silence sweep. The cursor overlay already hides such states through
 *  liveConnectionIds(); everything that reads awareness DIRECTLY (yCollab's
 *  caret rendering, the viz "who is on which tab" strip) has no such gate, so
 *  the state itself is removed here — the same removeAwarenessStates path the
 *  sweep takes, just triggered by presence instead of the clock. Fires
 *  "change" (removed) so every consumer re-renders. A live peer that
 *  reconnected re-stamps its `user` field with the new connectionId, and that
 *  update carries a higher clock, so it re-adds cleanly (verified: prune
 *  harness). States without a connectionId are unknown, not dead — kept. */
function pruneGoneAwareness(aw: Awareness, live: ReadonlySet<string>): void {
  if (live.size === 0) {
    return; // no presence yet — nothing is known to be gone
  }
  const gone: number[] = [];
  for (const [clientID, state] of aw.getStates()) {
    if (clientID === aw.clientID) {
      continue;
    }
    const connectionId = (state.user as { connectionId?: string } | undefined)
      ?.connectionId;
    if (connectionId !== undefined && !live.has(connectionId)) {
      gone.push(clientID);
    }
  }
  if (gone.length > 0) {
    removeAwarenessStates(aw, gone, AWARENESS_PRUNE_ORIGIN);
  }
}

type InternalSlideSession = {
  productId: string;
  slideId: string;
  doc: Y.Doc;
  awareness: Awareness;
  localOrigin: object;
  undoManager: Y.UndoManager;
  ready: boolean;
  /** The lineage epoch of the doc this session holds (from its first sync).
   *  See resetLineage. */
  epoch?: string;
  onRemote: () => void;
  /** `fatal` ⇔ the document/room is gone (deleted/replaced/not found): the
   *  editor must stop editing. See CollabServerMessage. */
  onError?: (message: string, fatal?: boolean) => void;
  /** The session swapped its doc (and undo manager) for one of the server's
   *  lineage: the host must rebind whatever it bound to the old doc. */
  onLineageReset?: () => void;
};

const slideSessions = new Map<string, InternalSlideSession>();

/** Handle to a live slide document, returned by openSlideSession. */
export type SlideSession = {
  doc: Y.Doc;
  /** Yjs awareness for this slide: carries local + remote cursor/selection. */
  awareness: Awareness;
  /** Transaction origin for this client's pushLocal writes: undoManager
   *  tracks it, so undo/redo only ever affects this user's edits. */
  localOrigin: object;
  /** Per-user undo/redo stack for the whole slide doc. Tracks pushLocal
   *  writes (localOrigin), and every textbox's yCollab binding registers its
   *  own sync origin here too, so the editor's undo buttons and in-textbox
   *  Ctrl+Z pop the SAME unified history (text + structural edits). Remote
   *  peers' updates arrive under the server origin and are never tracked.
   *  Owned by the session: destroyed with it. */
  undoManager: Y.UndoManager;
  isReady: () => boolean;
  /**
   * Ready AND the socket is currently open, i.e. collab is actually
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
function selfIdentity(): {
  connectionId: string;
  email: string;
  name: string;
  color: string;
} | null {
  const self = collabStore.peers.find(
    (p) => p.connectionId === collabStore.connectionId,
  );
  return self
    ? {
      connectionId: self.connectionId,
      email: self.email,
      name: self.name,
      color: self.color,
    }
    : null;
}

function applySessionUser(awareness: Awareness): void {
  const id = selfIdentity();
  if (!id) {
    return;
  }
  const next = {
    name: id.name,
    color: id.color,
    // Selection-highlight color: y-codemirror paints the peer's selected
    // RANGE with this as the background, so it must be translucent: the
    // opaque presence color would black out the selected text. "33" = ~20%
    // alpha on the hex color, matching the library's own fallback.
    colorLight: id.color + "33",
    // WHO this awareness state belongs to, and WHICH connection carries it.
    // Both are already public in `presence_state` (same audience
    // as awareness), and the cursor overlay needs them to guarantee one cursor
    // per PERSON: `email` collapses a user's other tabs (and hides their own
    // from themselves), `connectionId` lets a viewer drop states left behind by
    // connections the server has already dropped: presence knows within one
    // round trip, the Yjs liveness sweep takes ~30 s.
    email: id.email,
    connectionId: id.connectionId,
  };
  // Presence broadcasts land often (every peer view change); re-stamping an
  // identical identity would ship an awareness update to everyone each time.
  const prev = awareness.getLocalState()?.user as typeof next | undefined;
  if (
    prev && prev.name === next.name && prev.color === next.color &&
    prev.email === next.email && prev.connectionId === next.connectionId
  ) {
    return;
  }
  awareness.setLocalStateField("user", next);
}

// Set once the deploy-boundary guard has decided to reload (see
// maybeReloadOnServerVersionChange). socket.onopen re-subscribes every open
// session BEFORE the `hello` frame carrying the version can possibly be seen,
// so the server's *_sync answers keep arriving while the reload navigation is
// still pending, and their two-way catch-up would push this tab's PRE-DEPLOY
// Yjs docs into the freshly re-seeded rooms, which is exactly what the reload
// exists to prevent. Muting the socket closes that window deterministically.
let reloadingForServerVersion = false;

function sendCollab(msg: CollabClientMessage): boolean {
  if (reloadingForServerVersion) {
    return false;
  }
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  ws.send(JSON.stringify(msg));
  return true;
}

function subscribeSlideOnSocket(s: InternalSlideSession): void {
  sendCollab({
    type: "slide_subscribe",
    data: {
      productId: s.productId,
      slideId: s.slideId,
      stateVector: bytesToBase64(Y.encodeStateVector(s.doc)),
    },
  });
}

function destroySlideSession(s: InternalSlideSession): void {
  slideSessions.delete(s.slideId);
  setDocSaveFailing("slide", s.slideId, false);
  // Before the doc: destroying detaches its listeners from the doc it scopes.
  try {
    s.undoManager.destroy();
  } catch (err) {
    console.error("Collab: slide undo manager destroy failed", err);
  }
  try {
    removeAwarenessStates(s.awareness, [s.awareness.clientID], "local");
    s.awareness.destroy();
  } catch (err) {
    console.error("Collab: slide awareness destroy failed", err);
  }
  try {
    s.doc.destroy();
  } catch (err) {
    console.error("Collab: slide doc destroy failed", err);
  }
}

/** `productId` is the deck the slide belongs to: it keys the server room. */
// The session's outbound wiring: local doc updates and awareness changes go
// to the server. A function, not inline in openSlideSession, because a
// lineage reset re-wires a fresh doc the same way.
function wireSlideDoc(
  s: InternalSlideSession,
  doc: Y.Doc,
  awareness: Awareness,
): void {
  const { productId, slideId } = s;
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    // Updates applied from the server must not be shipped back.
    if (origin === SLIDE_REMOTE_ORIGIN) {
      return;
    }
    sendCollab({
      type: "slide_update",
      data: { productId, slideId, update: bytesToBase64(update) },
    });
  });

  awareness.on(
    "update",
    (
      changes: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      // Don't re-ship awareness that was just applied from the server, nor
      // local presence-driven prunes.
      if (isLocalOnlyAwarenessOrigin(origin)) {
        return;
      }
      const changed = [
        ...changes.added,
        ...changes.updated,
        ...changes.removed,
      ];
      const update = encodeAwarenessUpdate(awareness, changed);
      sendCollab({
        type: "awareness_update",
        data: { productId, slideId, update: bytesToBase64(update) },
      });
    },
  );
}

// ── Lineage resets ───────────────────────────────────────────────────────────
// A sync whose epoch differs from the one this session's doc carries comes
// from a room that RE-SEEDED: a fresh Yjs doc of the same text (the stored
// CRDT state had gone stale). Merging it into the doc we hold would keep both
// lineages, i.e. every character twice, and the two-way catch-up would push
// our copy back to the server to be checkpointed. Adopt the server's doc
// instead: a fresh doc with the sync applied replaces ours. Edits made while
// the socket was down are dropped with the old doc (they were never going to
// land; the room that could have taken them is gone), which is the right
// loss beside a doubled document.

function teardownDoc(doc: Y.Doc, awareness: Awareness, what: string): void {
  try {
    removeAwarenessStates(awareness, [awareness.clientID], "local");
    awareness.destroy();
  } catch (err) {
    console.error(`Collab: ${what} awareness destroy failed`, err);
  }
  try {
    doc.destroy();
  } catch (err) {
    console.error(`Collab: ${what} doc destroy failed`, err);
  }
}

function resetSlideLineage(
  s: InternalSlideSession,
  update: Uint8Array,
  epoch: string,
): void {
  console.warn(
    `Collab: slide ${s.slideId} room re-seeded (lineage ${s.epoch} → ${epoch}); adopting the server's document`,
  );
  const old = { doc: s.doc, awareness: s.awareness, undoManager: s.undoManager };
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update, SLIDE_REMOTE_ORIGIN);
  const awareness = new Awareness(doc);
  applySessionUser(awareness);
  s.doc = doc;
  s.awareness = awareness;
  s.undoManager = new Y.UndoManager(slideDocRoot(doc), {
    trackedOrigins: new Set([s.localOrigin]),
    captureTimeout: 500,
  });
  s.epoch = epoch;
  wireSlideDoc(s, doc, awareness);
  try {
    old.undoManager.destroy();
  } catch (err) {
    console.error("Collab: slide undo manager destroy failed", err);
  }
  teardownDoc(old.doc, old.awareness, "slide");
  s.onLineageReset?.();
}

export function openSlideSession(
  productId: string,
  slideId: string,
  onRemote: () => void,
  onError?: (message: string, fatal?: boolean) => void,
  onLineageReset?: () => void,
): SlideSession {
  const prior = slideSessions.get(slideId);
  if (prior) {
    destroySlideSession(prior);
  }

  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  applySessionUser(awareness);
  const localOrigin = {};
  const s: InternalSlideSession = {
    productId,
    slideId,
    doc,
    awareness,
    localOrigin,
    undoManager: new Y.UndoManager(slideDocRoot(doc), {
      trackedOrigins: new Set([localOrigin]),
      captureTimeout: 500,
    }),
    ready: false,
    onRemote,
    onError,
    onLineageReset,
  };
  slideSessions.set(slideId, s);
  wireSlideDoc(s, doc, awareness);

  // Subscribe now if connected; otherwise socket.onopen re-subscribes all.
  subscribeSlideOnSocket(s);

  return {
    // Getters: a lineage reset swaps the session's doc, awareness and undo
    // manager, and the host reads the current ones through this handle.
    get doc() {
      return s.doc;
    },
    get awareness() {
      return s.awareness;
    },
    localOrigin: s.localOrigin,
    get undoManager() {
      return s.undoManager;
    },
    isReady: () => s.ready,
    isLive: () => s.ready && !!ws && ws.readyState === WebSocket.OPEN,
    pushLocal: (slide: Slide, opts?: SyncSlideOpts) => {
      if (!s.ready) {
        return;
      }
      s.doc.transact(() => syncSlideToDoc(s.doc, slide, opts), s.localOrigin);
    },
    close: () => closeSlideSession(slideId),
  };
}

export function closeSlideSession(slideId: string): void {
  const s = slideSessions.get(slideId);
  if (!s) {
    return;
  }
  sendCollab({
    type: "slide_unsubscribe",
    data: { productId: s.productId, slideId },
  });
  destroySlideSession(s);
}

// ── Report CRDT sessions ─────────────────────────────────────────────────────
// Mirrors the slide sessions above, over the report_* message family. The body
// is edited through a yCollab CodeMirror binding on the doc's Y.Text; the
// figure/image registries are pushed via pushRegistries; pushLocal exists only
// for the first-sync merge (before the editor binds).

type InternalReportSession = {
  productId: string;
  reportId: string;
  doc: Y.Doc;
  awareness: Awareness;
  ready: boolean;
  /** See InternalSlideSession.epoch. */
  epoch?: string;
  onRemote: () => void;
  /** See InternalSlideSession.onError. */
  onError?: (message: string, fatal?: boolean) => void;
  /** See InternalSlideSession.onLineageReset. */
  onLineageReset?: () => void;
};

const reportSessions = new Map<string, InternalReportSession>();

/** Handle to a live report document, returned by openReportSession. */
export type ReportSession = {
  doc: Y.Doc;
  /** Yjs awareness for this report: carries local + remote cursor/selection. */
  awareness: Awareness;
  isReady: () => boolean;
  /** Ready AND the socket is currently open: see SlideSession.isLive. */
  isLive: () => boolean;
  /** Diff full content onto the shared doc: first-sync merge only. */
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
      productId: s.productId,
      reportId: s.reportId,
      stateVector: bytesToBase64(Y.encodeStateVector(s.doc)),
    },
  });
}

function destroyReportSession(s: InternalReportSession): void {
  reportSessions.delete(s.reportId);
  setDocSaveFailing("report", s.reportId, false);
  try {
    removeAwarenessStates(s.awareness, [s.awareness.clientID], "local");
    s.awareness.destroy();
  } catch (err) {
    console.error("Collab: report awareness destroy failed", err);
  }
  try {
    s.doc.destroy();
  } catch (err) {
    console.error("Collab: report doc destroy failed", err);
  }
}

// See wireSlideDoc.
function wireReportDoc(
  s: InternalReportSession,
  doc: Y.Doc,
  awareness: Awareness,
): void {
  const { productId, reportId } = s;
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    // Updates applied from the server must not be shipped back.
    if (origin === SLIDE_REMOTE_ORIGIN) {
      return;
    }
    sendCollab({
      type: "report_update",
      data: { productId, reportId, update: bytesToBase64(update) },
    });
  });

  awareness.on(
    "update",
    (
      changes: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (isLocalOnlyAwarenessOrigin(origin)) {
        return;
      }
      const changed = [
        ...changes.added,
        ...changes.updated,
        ...changes.removed,
      ];
      const update = encodeAwarenessUpdate(awareness, changed);
      sendCollab({
        type: "report_awareness_update",
        data: { productId, reportId, update: bytesToBase64(update) },
      });
    },
  );
}

// See resetSlideLineage: the report editor rebinds CodeMirror to the new
// body text through onLineageReset (its bind key is the doc's guid).
function resetReportLineage(
  s: InternalReportSession,
  update: Uint8Array,
  epoch: string,
): void {
  console.warn(
    `Collab: report ${s.reportId} room re-seeded (lineage ${s.epoch} → ${epoch}); adopting the server's document`,
  );
  const old = { doc: s.doc, awareness: s.awareness };
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update, SLIDE_REMOTE_ORIGIN);
  const awareness = new Awareness(doc);
  applySessionUser(awareness);
  s.doc = doc;
  s.awareness = awareness;
  s.epoch = epoch;
  wireReportDoc(s, doc, awareness);
  teardownDoc(old.doc, old.awareness, "report");
  s.onLineageReset?.();
}

/** A report IS its product, so `productId` equals `reportId`; both ride so
 *  the two families share one wire shape. */
export function openReportSession(
  productId: string,
  reportId: string,
  onRemote: () => void,
  onError?: (message: string, fatal?: boolean) => void,
  onLineageReset?: () => void,
): ReportSession {
  const prior = reportSessions.get(reportId);
  if (prior) {
    destroyReportSession(prior);
  }

  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  applySessionUser(awareness);
  const s: InternalReportSession = {
    productId,
    reportId,
    doc,
    awareness,
    ready: false,
    onRemote,
    onError,
    onLineageReset,
  };
  reportSessions.set(reportId, s);
  wireReportDoc(s, doc, awareness);

  // Subscribe now if connected; otherwise socket.onopen re-subscribes all.
  subscribeReportOnSocket(s);

  return {
    // Getters: see the slide handle.
    get doc() {
      return s.doc;
    },
    get awareness() {
      return s.awareness;
    },
    isReady: () => s.ready,
    isLive: () => s.ready && !!ws && ws.readyState === WebSocket.OPEN,
    pushLocal: (content: ReportDocContent) => {
      if (!s.ready) {
        return;
      }
      s.doc.transact(() => syncReportToDoc(s.doc, content));
    },
    pushRegistries: (figures, images, opts) => {
      if (!s.ready) {
        return;
      }
      s.doc.transact(() => syncReportRegistries(s.doc, figures, images, opts));
    },
    close: () => closeReportSession(reportId),
  };
}

export function closeReportSession(reportId: string): void {
  const s = reportSessions.get(reportId);
  if (!s) {
    return;
  }
  sendCollab({
    type: "report_unsubscribe",
    data: { productId: s.productId, reportId },
  });
  destroyReportSession(s);
}

function handleReportServerMessage(msg: CollabServerMessage): boolean {
  if (msg.type === "report_sync") {
    const s = reportSessions.get(msg.data.reportId);
    if (s) {
      // Sync resets save health; the server re-sends failing state right after
      // when the room is still failing.
      setDocSaveFailing("report", msg.data.reportId, false);
      const epoch = msg.data.epoch;
      if (epoch !== undefined && s.epoch !== undefined && s.epoch !== epoch) {
        // Another lineage: adopt, never merge (see resetReportLineage).
        resetReportLineage(s, base64ToBytes(msg.data.update), epoch);
        s.ready = true;
        s.onRemote();
        return true;
      }
      if (epoch !== undefined) {
        s.epoch = epoch;
      }
      Y.applyUpdate(s.doc, base64ToBytes(msg.data.update), SLIDE_REMOTE_ORIGIN);
      s.ready = true;
      // Two-way sync: push anything the server is missing (guarded like the
      // slide path: a missing/malformed stateVector must not break onRemote).
      try {
        if (msg.data.stateVector) {
          const diff = Y.encodeStateAsUpdate(
            s.doc,
            base64ToBytes(msg.data.stateVector),
          );
          if (diff.length > 2) {
            sendCollab({
              type: "report_update",
              data: {
                productId: s.productId,
                reportId: msg.data.reportId,
                update: bytesToBase64(diff),
              },
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
    reportSessions
      .get(msg.data.reportId)
      ?.onError?.(msg.data.message, msg.data.fatal);
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
      // Sync resets save health; the server re-sends failing state right after
      // when the room is still failing.
      setDocSaveFailing("slide", msg.data.slideId, false);
      const epoch = msg.data.epoch;
      if (epoch !== undefined && s.epoch !== undefined && s.epoch !== epoch) {
        // Another lineage: adopt, never merge (see resetSlideLineage). The
        // fresh doc has nothing the server lacks, so no catch-up push.
        resetSlideLineage(s, base64ToBytes(msg.data.update), epoch);
        s.ready = true;
        s.onRemote();
        return true;
      }
      if (epoch !== undefined) {
        s.epoch = epoch;
      }
      Y.applyUpdate(s.doc, base64ToBytes(msg.data.update), SLIDE_REMOTE_ORIGIN);
      s.ready = true;
      // Two-way sync: push anything the server is missing, e.g. a local edit
      // whose slide_update was lost before this (re)connect (a switched viz that
      // updated locally but never reached the server). The diff carries just the
      // missing ops, not the whole doc; skip it when already in sync. Guarded:
      // a slide_sync without a (valid) stateVector, e.g. an older server build
      // during a deploy/rollback, must never break onRemote below.
      try {
        if (msg.data.stateVector) {
          const diff = Y.encodeStateAsUpdate(
            s.doc,
            base64ToBytes(msg.data.stateVector),
          );
          if (diff.length > 2) {
            sendCollab({
              type: "slide_update",
              data: {
                productId: s.productId,
                slideId: msg.data.slideId,
                update: bytesToBase64(diff),
              },
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
    slideSessions
      .get(msg.data.slideId)
      ?.onError?.(msg.data.message, msg.data.fatal);
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

function collabWsUrl(): string {
  // _SERVER_HOST is "" in production (same origin) and an http URL in dev.
  const origin = _SERVER_HOST || globalThis.location.origin;
  return origin.replace(/^http/, "ws") + "/collab";
}

function sendPresence(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }
  const message: CollabClientMessage = {
    type: "presence_update",
    // idle omitted (= active) rather than false: view fields are replaced
    // wholesale server-side, so absence is the natural "active" encoding.
    data: {
      avatarUrl,
      idle: isIdle || undefined,
      ...view,
    } satisfies PresenceView,
  };
  ws.send(JSON.stringify(message));
}

// Deploy-boundary guard. A tab that stays open across a server update never
// re-runs the mount-time version check (LoggedInWrapper), so it keeps running
// OLD client code with OLD caches, and worse, its reconnect catch-up would
// push its pre-deploy Yjs docs back into the server's freshly re-seeded rooms
// (the two-way sync ships "what the server is missing", which after a deploy
// is exactly the stale state a crdt_state-nulling migration just discarded).
// On the first hello carrying a NEW server version, force a reload instead:
// the reloaded page runs the mount check against the SAME localStorage key,
// which busts the IndexedDB caches: realtime teardown and cache bust ride
// one trigger. Edits made during the disconnection window are discarded
// (the accepted close()-while-offline tradeoff, and exactly the merge a
// version boundary must not allow). The sessionStorage flag caps this at one
// reload per seen version, so nothing can loop; localStorage itself is only
// ever written by the mount check, keeping ownership in one place.
function maybeReloadOnServerVersionChange(serverVersion: string): void {
  if (!serverVersion) {
    return;
  }
  const stored = localStorage.getItem("serverVersion");
  if (!stored || stored === serverVersion) {
    return;
  }
  const guardKey = `collabReloadedForVersion::${serverVersion}`;
  if (sessionStorage.getItem(guardKey)) {
    return;
  }
  sessionStorage.setItem(guardKey, "1");
  // Mute the socket BEFORE navigating: reload() does not stop message
  // dispatch, and onopen already shipped this tab's subscribes.
  reloadingForServerVersion = true;
  // …and CLOSE it, so session.isLive() reports false. Muting alone leaves
  // isLive() true (it reads ws.readyState), and both close-flush paths in the
  // editors skip their explicit REST save while isLive(), so a reload that
  // never commits (browser Stop on a slow deploy-time load) would drop every
  // later edit while the editor still claimed "Live". Closing also drops this
  // tab's presence immediately instead of leaving peers a stale cursor until
  // the server's ~30s sweep. Intentional close ⇒ no reconnect (see onclose).
  hardClose();
  console.log(
    `Collab: server updated (${stored} → ${serverVersion}) — reloading to resync`,
  );
  window.location.reload();
}

function openSocket(): void {
  const socket = new WebSocket(collabWsUrl());
  ws = socket;

  socket.onopen = () => {
    attempts = 0;
    lastReceivedAt = Date.now(); // liveness watchdog baseline
    setSocketOpen(true);
    notifyCollabConnection("connected");
    sendPresence();
    // Re-subscribe any open sessions (covers first connect + reconnect:
    // the server sends only what each doc's state vector is missing).
    for (const s of slideSessions.values()) {
      subscribeSlideOnSocket(s);
    }
    for (const s of reportSessions.values()) {
      subscribeReportOnSocket(s);
    }
  };

  socket.onmessage = (event) => {
    // Any received frame proves the link is alive (liveness watchdog below).
    lastReceivedAt = Date.now();
    let msg: CollabServerMessage;
    try {
      msg = parseJsonOrThrow<CollabServerMessage>(event.data);
    } catch (err) {
      console.error("Collab: malformed server message", err);
      return;
    }
    if (msg.type === "hello") {
      setCollabStore("connectionId", msg.data.connectionId);
      maybeReloadOnServerVersionChange(msg.data.serverVersion);
    } else if (msg.type === "error") {
      // Connection-level rejection (e.g. an over-sized frame). The doc
      // families carry their own *_error messages; this one is just logged:
      // the affected update is dropped and normal sync continues.
      console.warn("Collab server error:", msg.data.message);
    } else if (msg.type === "presence_state") {
      setCollabStore("peers", msg.data.peers);
      // Our identity (name/color) may have just arrived — stamp it on any open
      // session's awareness so remote peers see a labelled cursor. And drop
      // the awareness of any connection this presence no longer lists (see
      // pruneGoneAwareness) — the caret/avatar of a peer who just closed
      // their tab must not wait ~30 s for the awareness sweep.
      const live = liveConnectionIds();
      for (const s of slideSessions.values()) {
        applySessionUser(s.awareness);
        pruneGoneAwareness(s.awareness, live);
      }
      for (const s of reportSessions.values()) {
        applySessionUser(s.awareness);
        pruneGoneAwareness(s.awareness, live);
      }
      // "Alice joined this deck" toasts: scoped to the doc I'm currently in.
      notifyPresenceToasts(msg.data.peers, collabStore.connectionId, view);
    } else if (msg.type === "doc_save_state") {
      // Room checkpoint health: editors surface "not saving" instead of
      // claiming "Live" while the server can't persist.
      setDocSaveFailing(msg.data.docType, msg.data.docId, msg.data.failing);
    } else if (msg.type === "pong") {
      // Liveness only: receipt was already recorded above.
    } else if (!handleSlideServerMessage(msg)) {
      handleReportServerMessage(msg);
    }
  };

  socket.onclose = (event) => {
    const intentional = intentionallyClosed.has(socket);
    if (ws === socket) {
      ws = undefined;
      setSocketOpen(false);
    }
    if (intentional) {
      return;
    }
    // A close code the server only sends when this user may never hold this
    // socket (not approved). Retrying cannot fix it, and the "reconnecting"
    // banner would be both permanent and untrue, so stand down silently. A
    // later approval reconnects the whole realtime layer (reconnectForApproval
    // in t1_sse.tsx), which clears this and connects again.
    if (TERMINAL_CLOSE_CODES.has(event.code)) {
      unauthorized = true;
      notifyCollabConnection("unauthorized");
      return;
    }
    notifyCollabConnection("reconnecting");
    scheduleReconnect();
  };

  socket.onerror = () => {
    socket.close();
  };
}

function scheduleReconnect(): void {
  if (!wantConnection || unauthorized) {
    return;
  }
  attempts += 1;
  const delay = Math.min(
    BASE_RETRY_DELAY * 2 ** Math.min(attempts, RETRY_EXPONENT_CAP),
    MAX_RETRY_DELAY,
  );
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  reconnectTimer = setTimeout(() => {
    if (wantConnection) {
      openSocket();
    }
  }, delay);
}

// Reconnect NOW when the network or the tab plausibly came back: skips the
// (up to 30s) backoff wait. Registered once for the module's lifetime; no-ops
// when no connection is wanted or the socket is already up/connecting.
function retryNow(): void {
  if (!wantConnection || unauthorized) {
    return;
  }
  if (ws && ws.readyState <= WebSocket.OPEN) {
    return; // CONNECTING or OPEN
  }
  attempts = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  openSocket();
}
window.addEventListener("online", retryNow);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    retryNow();
  }
});

// ── Idle detection ───────────────────────────────────────────────────────────
// After IDLE_AFTER_MS without any input in this tab, presence broadcasts
// idle=true (peers' avatar UIs dim this user); the next input broadcasts
// idle=false immediately. Input tracking is purely local: nothing goes over
// the wire per mousemove, only the two transitions call sendPresence(), and
// sendPresence() itself re-sends the current flag on every (re)connect.
// Registered once for the module's lifetime, like the retryNow listeners.

const IDLE_AFTER_MS = 3 * 60_000;
const IDLE_CHECK_MS = 15_000;

let lastInputAt = Date.now();
let isIdle = false;

function noteInput(): void {
  lastInputAt = Date.now();
  if (isIdle) {
    isIdle = false;
    sendPresence();
  }
}
// Capture phase so app code calling stopPropagation can't hide activity.
for (const evt of ["pointermove", "pointerdown", "keydown", "wheel"]) {
  document.addEventListener(evt, noteInput, { passive: true, capture: true });
}
// Returning to the tab is an intentional act even before the first
// mousemove/keydown lands in it (e.g. an alt-tab reader).
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    noteInput();
  }
});
setInterval(() => {
  if (!isIdle && Date.now() - lastInputAt >= IDLE_AFTER_MS) {
    isIdle = true;
    sendPresence();
  }
}, IDLE_CHECK_MS);

// ── Connection liveness watchdog (client-side heartbeat) ────────────────────
// The SERVER side of dead-peer detection is Deno's protocol-level ping
// (idleTimeout: 30 in routes/instance/collab.ts). Browsers can neither observe
// protocol pings nor send their own, so when the path dies silently under
// this tab (NAT drop, server hard-kill, network switch) the socket keeps
// LOOKING open for however long TCP takes to notice: editors claim "Live",
// session.isLive() misleads the close-flush logic, and edits stream into a
// dead pipe. So: send an app-level ping on a timer, and if NO traffic at all
// (the pong, or anything else) arrives back within the deadline, force-close
// the socket: onclose (not marked intentional) then runs the normal
// reconnect + Yjs catch-up. Worst-case detection ≈ interval + deadline.
// Registered once for the module's lifetime, like the idle detector.

const PING_INTERVAL_MS = 25_000;
const PONG_DEADLINE_MS = 10_000;

// Stamped on open and on EVERY received frame (any traffic proves the link).
let lastReceivedAt = 0;

setInterval(() => {
  const socket = ws;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  const sentAt = Date.now();
  sendCollab({ type: "ping" });
  setTimeout(() => {
    // Only kill the SAME socket, still nominally open, that received nothing
    // since the ping left. (A frozen-then-resumed tab re-enters here cleanly:
    // the next tick pings again before any deadline can fire.)
    if (ws !== socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    if (lastReceivedAt < sentAt) {
      socket.close();
    }
  }, PONG_DEADLINE_MS);
}, PING_INTERVAL_MS);

function hardClose(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  if (ws) {
    intentionallyClosed.add(ws);
    ws.close();
    ws = undefined;
    setSocketOpen(false);
  }
}

/** Tear down and immediately re-open the collab socket. The server snapshots
 *  authorization once per connection, so anything that changes this user's
 *  standing never reaches an open socket on its own: a stale-auth editor
 *  keeps getting non-fatal "No edit permission" rejections while its local doc
 *  diverges. Reconnecting re-derives auth server-side; onopen re-subscribes
 *  every open session and the two-way sync pushes any local ops the server
 *  is missing (edits typed during the stale window get saved, not lost).
 *  No-op when no connection is wanted. */
export function reconnectCollab(reason: string): void {
  if (!wantConnection) {
    return;
  }
  console.log(`Collab: reconnecting (${reason})`);
  // Clear a previous authorization refusal: an approval is exactly the event
  // that flips it.
  unauthorized = false;
  hardClose();
  retryNow();
}

// Self-heal for a "No edit permission" rejection that CONTRADICTS the client's
// live permission state: the socket's snapshot auth is stale (the grant's SSE
// event raced or was missed), so reconnect to re-derive it. Cooldown-guarded:
// if the server still rejects after a fresh connect, the disagreement is real
// (client store wrong, not the socket) and looping reconnects would just churn.
let lastStaleAuthReconnectAt = 0;
const STALE_AUTH_RECONNECT_COOLDOWN_MS = 30_000;

export function reconnectForStaleEditAuth(): void {
  const now = Date.now();
  if (now - lastStaleAuthReconnectAt < STALE_AUTH_RECONNECT_COOLDOWN_MS) {
    return;
  }
  lastStaleAuthReconnectAt = now;
  reconnectCollab("edit rejected but permissions say editable");
}

/** Open the one instance-wide socket. Idempotent: the instance boundary calls
 *  it whenever approval is (re)established, which includes reconnect paths
 *  where a socket is already up. */
export function connectCollab(): void {
  if (wantConnection && ws && ws.readyState <= WebSocket.OPEN) {
    return;
  }
  hardClose();
  wantConnection = true;
  attempts = 0;
  unauthorized = false;
  setCollabStore({ connectionId: null, peers: [] });
  setSaveFailingKeys(new Set<string>());
  // Initial connect (not a drop): the banner stays hidden in this state; a
  // failure moves it to "reconnecting" via onclose.
  notifyCollabConnection("connecting");
  openSocket();
}

export function disconnectCollab(): void {
  // Destroy sessions BEFORE closing the socket:
  // their teardown broadcasts awareness REMOVALS (removeAwarenessStates →
  // update handler → send), which must ship on the still-open socket so
  // peers clear our cursors instantly instead of waiting for the ~30s
  // liveness sweep. (A hard tab close still leaves that sweep as the
  // fallback: nothing can be sent then.)
  for (const s of [...slideSessions.values()]) {
    destroySlideSession(s);
  }
  for (const s of [...reportSessions.values()]) {
    destroyReportSession(s);
  }
  hardClose();
  resetPresenceToasts();
  notifyCollabConnection("idle");
  wantConnection = false;
  attempts = 0;
  avatarUrl = undefined;
  view = {};
  setCollabStore({ connectionId: null, peers: [] });
  setSaveFailingKeys(new Set<string>());
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
  editingFigureId?: string;
}): void {
  view = next;
  sendPresence();
}
