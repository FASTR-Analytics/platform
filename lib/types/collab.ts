// =============================================================================
// Collaborative editing — realtime protocol (WebSocket)
// =============================================================================
//
// Transport: a per-project WebSocket at GET /project_collab/:project_id,
// separate from the one-way server→client SSE channel. It carries
// low-frequency presence (who is where, idle/editing state) plus three
// parallel CRDT document-sync families — slide_*, report_*, po_* — kept as
// separate message sets so each family's wire format stays byte-stable
// across deploys.

import { z } from "zod";

/**
 * One peer's live presence within a project.
 *
 * Identity (`email`, `name`, `color`) is stamped server-side from the
 * authenticated user and cannot be spoofed. `avatarUrl` is self-reported by the
 * client (the server has no avatar URL) and is therefore advisory only.
 * `deckId`/`slideId`/`selectedBlockId`/`selectedTextTarget` describe what the
 * peer is currently looking at; they are replaced wholesale on every presence
 * update so a peer can clear them by omitting them. `selectedBlockId` is the
 * SELECTED ELEMENT id, contextualized by the doc fields: a slide layout-block
 * node id (with `slideId`), or a report figure/image embed id (with
 * `reportId`) — peers draw presence borders around it. `selectedTextTarget`
 * is a panther text-primitive id (e.g. "coverTitle", "headerText") for the
 * root title/header fields — mutually exclusive with `selectedBlockId`.
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
  /** Set ⇔ the peer has that standalone visualization open in the editor. */
  poId?: string;
  /** Set ⇔ the peer has the figure editor open on a figure embedded in the
   *  slide/report they are in (the slide layout-block id or the report figure
   *  registry id). Contextualized by `slideId`/`reportId`. */
  editingFigureId?: string;
  /** Self-reported by the client after a few minutes without any input in its
   *  tab (cleared on the next input). Presence UI dims idle peers. */
  idle?: boolean;
  /** Stamped SERVER-side (never client-settable): true while this connection
   *  is actively applying document edits, cleared after a short quiet period.
   *  Presence UI pulses "editing now" on list cards. */
  isEditing?: boolean;
};

/** The presence fields a client controls about itself. */
export type PresenceView = {
  avatarUrl?: string;
  deckId?: string;
  slideId?: string;
  selectedBlockId?: string;
  selectedTextTarget?: string;
  reportId?: string;
  poId?: string;
  editingFigureId?: string;
  idle?: boolean;
};

/** Client → server messages. */
export type CollabClientMessage =
  | { type: "presence_update"; data: PresenceView }
  // CRDT document sync. `update`/`stateVector` are base64-encoded
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
  | { type: "report_awareness_update"; data: { reportId: string; update: string } }
  // Presentation-object (standalone visualization) CRDT sync — a third parallel
  // family, same rationale as report_* (keeps slide/report messages byte-stable).
  | { type: "po_subscribe"; data: { poId: string; stateVector: string } }
  | { type: "po_update"; data: { poId: string; update: string } }
  | { type: "po_unsubscribe"; data: { poId: string } }
  | { type: "po_awareness_update"; data: { poId: string; update: string } }
  // PROJECT-scoped Yjs awareness (no doc id): page-level live cursors on the
  // project tab pages, which have no doc room. Opaque relay to every other
  // admitted connection in the project — presence-class visibility, never
  // persisted, never applied to any server doc.
  | { type: "project_awareness_update"; data: { update: string } }
  // Client-side liveness probe. The SERVER side of dead-peer detection is
  // Deno's built-in protocol ping (idleTimeout — see project-collab.ts), but
  // browsers can neither see protocol pings nor send their own, so a client
  // whose path died silently would keep an OPEN-looking socket for minutes.
  // The client sends this on a timer and force-closes the socket when no
  // traffic (the pong, or anything else) arrives back in time — dropping into
  // the normal reconnect + catch-up machinery. Server replies `pong`; never
  // required (older clients simply don't send it).
  | { type: "ping" };

// ── Server-side frame validation ─────────────────────────────────────────────
// Every frame arriving on the collab socket is schema-checked before any
// handler touches it (project-collab.ts). Handlers dereference msg.data
// directly, so without this a malformed frame threw into the process-level
// error backstop; the length bounds also cap the amplification surface —
// presence fields are re-serialized to every project connection on every
// presence change, and awareness frames relay to whole rooms.

/** Document ids: slides are 3 chars, reports/POs are UUIDs (36). */
const collabIdSchema = z.string().min(1).max(64);
/** Yjs state vectors are a few bytes per client that ever wrote to the doc. */
const stateVectorSchema = z.string().max(128 * 1024);
/** Doc updates legitimately carry multi-MB figure bundles — the 32 MiB frame
 *  cap (project-collab.ts) is the real bound; this mirrors it. */
const docUpdateSchema = z.string().max(32 * 1024 * 1024);
/** Awareness = cursor/selection state: legitimately tiny. */
const awarenessUpdateSchema = z.string().max(64 * 1024);
/** Block/text-target ids (layout-node ids, panther text-primitive ids). */
const elementIdSchema = z.string().max(256);

/** avatarUrl renders as <img src> on every peer, so it must be a bounded https
 *  URL — and an invalid value degrades to "no avatar" (catch → undefined)
 *  rather than rejecting the whole presence frame. */
const avatarUrlSchema = z
  .string()
  .max(2048)
  .refine((u) => {
    try {
      return new URL(u).protocol === "https:";
    } catch {
      return false;
    }
  })
  .optional()
  .catch(undefined);

const presenceViewSchema = z.object({
  avatarUrl: avatarUrlSchema,
  deckId: collabIdSchema.optional(),
  slideId: collabIdSchema.optional(),
  selectedBlockId: elementIdSchema.optional(),
  selectedTextTarget: elementIdSchema.optional(),
  reportId: collabIdSchema.optional(),
  poId: collabIdSchema.optional(),
  editingFigureId: elementIdSchema.optional(),
  idle: z.boolean().optional(),
});

/** Validates (and bounds) every client→server frame. Unknown keys are
 *  stripped; a frame that fails outright is rejected with a connection-level
 *  `error` message and dropped. */
export const collabClientMessageSchema: z.ZodType<CollabClientMessage> = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("presence_update"), data: presenceViewSchema }),
    z.object({
      type: z.literal("slide_subscribe"),
      data: z.object({ slideId: collabIdSchema, stateVector: stateVectorSchema }),
    }),
    z.object({
      type: z.literal("slide_update"),
      data: z.object({ slideId: collabIdSchema, update: docUpdateSchema }),
    }),
    z.object({
      type: z.literal("slide_unsubscribe"),
      data: z.object({ slideId: collabIdSchema }),
    }),
    z.object({
      type: z.literal("awareness_update"),
      data: z.object({ slideId: collabIdSchema, update: awarenessUpdateSchema }),
    }),
    z.object({
      type: z.literal("report_subscribe"),
      data: z.object({ reportId: collabIdSchema, stateVector: stateVectorSchema }),
    }),
    z.object({
      type: z.literal("report_update"),
      data: z.object({ reportId: collabIdSchema, update: docUpdateSchema }),
    }),
    z.object({
      type: z.literal("report_unsubscribe"),
      data: z.object({ reportId: collabIdSchema }),
    }),
    z.object({
      type: z.literal("report_awareness_update"),
      data: z.object({ reportId: collabIdSchema, update: awarenessUpdateSchema }),
    }),
    z.object({
      type: z.literal("po_subscribe"),
      data: z.object({ poId: collabIdSchema, stateVector: stateVectorSchema }),
    }),
    z.object({
      type: z.literal("po_update"),
      data: z.object({ poId: collabIdSchema, update: docUpdateSchema }),
    }),
    z.object({
      type: z.literal("po_unsubscribe"),
      data: z.object({ poId: collabIdSchema }),
    }),
    z.object({
      type: z.literal("po_awareness_update"),
      data: z.object({ poId: collabIdSchema, update: awarenessUpdateSchema }),
    }),
    z.object({
      type: z.literal("project_awareness_update"),
      data: z.object({ update: awarenessUpdateSchema }),
    }),
    z.object({ type: z.literal("ping") }),
  ]);

/** Server → client messages.
 *
 *  The `*_error` families carry an optional `fatal` flag: fatal ⇔ the document
 *  (or its room) is GONE — deleted, replaced by a restore, or never existed —
 *  so the session must stop editing (further updates would be silently
 *  dropped). Non-fatal errors are per-operation rejections (no edit
 *  permission, malformed update) and the session stays usable. */
export type CollabServerMessage =
  | { type: "hello"; data: { connectionId: string } }
  | { type: "presence_state"; data: { peers: PresenceEntry[] } }
  // Connection-level rejection (e.g. over-sized or invalid frame) — the client
  // logs it; per-document failures use the families' own *_error messages.
  | { type: "error"; data: { message: string } }
  // CRDT document sync (Milestone 2). `stateVector` is the server room's current
  // state vector, so the client can reply with any updates the server is missing
  // (local edits whose slide_update failed to send before a reconnect).
  | {
    type: "slide_sync";
    data: { slideId: string; update: string; stateVector: string };
  }
  | { type: "slide_update"; data: { slideId: string; update: string } }
  | {
    type: "slide_error";
    data: { slideId: string; message: string; fatal?: boolean };
  }
  // Yjs awareness relayed from another client in the room.
  | { type: "awareness"; data: { slideId: string; update: string } }
  // Report CRDT sync (parallel family — see the client message note).
  | {
    type: "report_sync";
    data: { reportId: string; update: string; stateVector: string };
  }
  | { type: "report_update"; data: { reportId: string; update: string } }
  | {
    type: "report_error";
    data: { reportId: string; message: string; fatal?: boolean };
  }
  | { type: "report_awareness"; data: { reportId: string; update: string } }
  // Presentation-object CRDT sync (parallel family — see the client message note).
  | {
    type: "po_sync";
    data: { poId: string; update: string; stateVector: string };
  }
  | { type: "po_update"; data: { poId: string; update: string } }
  | { type: "po_error"; data: { poId: string; message: string; fatal?: boolean } }
  | { type: "po_awareness"; data: { poId: string; update: string } }
  // Checkpoint health for a live room: `failing: true` when the room's
  // persistence saves are erroring (edits live only in the room doc until it
  // recovers), `failing: false` on recovery. Sent to every room member on each
  // transition, and to late joiners of a currently-failing room after their
  // sync. Generic across the three families — docType is the room's family
  // ("slide" | "report" | "po").
  | {
    type: "doc_save_state";
    data: { docType: string; docId: string; failing: boolean };
  }
  // Project-scoped awareness relayed from another connection (see the client
  // message counterpart above).
  | { type: "project_awareness"; data: { update: string } }
  // Reply to a client `ping` (liveness probe — see the client message note).
  // Carries no data: ANY received traffic proves the link, this just
  // guarantees there is some.
  | { type: "pong" };

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

// Used when a peer's awareness state hasn't arrived yet (live_cursors.tsx) —
// the palette's own blue entry, so the placeholder never clashes visually
// once the real presence color lands.
export const PRESENCE_FALLBACK_COLOR = PRESENCE_PALETTE[5];

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
