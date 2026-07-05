// =============================================================================
// Collaborative editing — realtime presence protocol (WebSocket)
// =============================================================================
//
// Transport: a per-project WebSocket at GET /project_collab/:project_id,
// separate from the one-way server→client SSE channel. Milestone 1 carries
// low-frequency presence only (who is in the deck, which slide they are on,
// which block they have selected). Later milestones extend the same channel
// with CRDT document ops.

/**
 * One peer's live presence within a project.
 *
 * Identity (`email`, `name`, `color`) is stamped server-side from the
 * authenticated user and cannot be spoofed. `avatarUrl` is self-reported by the
 * client (the server has no avatar URL) and is therefore advisory only.
 * `deckId`/`slideId`/`selectedBlockId`/`selectedTextTarget` describe what the
 * peer is currently looking at; they are replaced wholesale on every presence
 * update so a peer can clear them by omitting them. `selectedBlockId` is a
 * layout-block node id; `selectedTextTarget` is a panther text-primitive id
 * (e.g. "coverTitle", "headerText") for the root title/header fields — the two
 * are mutually exclusive (a peer is editing a block OR a title field).
 */
export type PresenceEntry = {
  connectionId: string;
  email: string;
  name: string;
  color: string;
  avatarUrl?: string;
  deckId?: string;
  slideId?: string;
  selectedBlockId?: string;
  selectedTextTarget?: string;
  /** Set ⇔ the peer has that report open in the report editor. */
  reportId?: string;
};

/** The presence fields a client controls about itself. */
export type PresenceView = {
  avatarUrl?: string;
  deckId?: string;
  slideId?: string;
  selectedBlockId?: string;
  selectedTextTarget?: string;
  reportId?: string;
};

/** Client → server messages. */
export type CollabClientMessage =
  | { type: "presence_update"; data: PresenceView }
  | { type: "heartbeat" }
  // CRDT document sync (Milestone 2). `update`/`stateVector` are base64-encoded
  // Yjs binary payloads (see bytesToBase64/base64ToBytes in lib/collab).
  | { type: "slide_subscribe"; data: { slideId: string; stateVector: string } }
  | { type: "slide_update"; data: { slideId: string; update: string } }
  | { type: "slide_unsubscribe"; data: { slideId: string } }
  // Yjs awareness (cursor/selection positions) — ephemeral, relayed not persisted.
  | { type: "awareness_update"; data: { slideId: string; update: string } }
  // Report CRDT sync — a parallel message family (rather than a generic
  // doc_* protocol) so the slide messages stay byte-identical across deploys.
  | { type: "report_subscribe"; data: { reportId: string; stateVector: string } }
  | { type: "report_update"; data: { reportId: string; update: string } }
  | { type: "report_unsubscribe"; data: { reportId: string } }
  | { type: "report_awareness_update"; data: { reportId: string; update: string } };

/** Server → client messages. */
export type CollabServerMessage =
  | { type: "hello"; data: { connectionId: string } }
  | { type: "presence_state"; data: { peers: PresenceEntry[] } }
  | { type: "error"; data: { message: string } }
  // CRDT document sync (Milestone 2). `stateVector` is the server room's current
  // state vector, so the client can reply with any updates the server is missing
  // (local edits whose slide_update failed to send before a reconnect).
  | {
    type: "slide_sync";
    data: { slideId: string; update: string; stateVector: string };
  }
  | { type: "slide_update"; data: { slideId: string; update: string } }
  | { type: "slide_error"; data: { slideId: string; message: string } }
  // Yjs awareness relayed from another client in the room.
  | { type: "awareness"; data: { slideId: string; update: string } }
  // Report CRDT sync (parallel family — see the client message note).
  | {
    type: "report_sync";
    data: { reportId: string; update: string; stateVector: string };
  }
  | { type: "report_update"; data: { reportId: string; update: string } }
  | { type: "report_error"; data: { reportId: string; message: string } }
  | { type: "report_awareness"; data: { reportId: string; update: string } };

const PRESENCE_PALETTE = [
  "#ef4444",
  "#f97316",
  "#d97706",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#7c3aed",
  "#db2777",
];

/**
 * Deterministic presence color for a key (e.g. email) so a user keeps the same
 * color across sessions and across every other client's view of them.
 */
export function presenceColorForKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return PRESENCE_PALETTE[Math.abs(hash) % PRESENCE_PALETTE.length];
}
