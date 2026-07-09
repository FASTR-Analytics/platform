import type { CollabServerMessage, PresenceEntry, PresenceView } from "lib";

// In-process presence registry for the collab WebSocket. Single-process only
// (matches the in-process BroadcastChannel assumption elsewhere); horizontal
// scaling across instances is a later milestone (Valkey pub/sub).

type Sender = { send: (data: string) => void };
type Conn = {
  entry: PresenceEntry;
  ws: Sender;
  /** Pending clear of the server-stamped `isEditing` flag. */
  editingTimer?: ReturnType<typeof setTimeout>;
};
type Identity = { email: string; name: string; color: string };

/** How long after the last applied doc update a connection still counts as
 *  "editing now". Long enough to bridge normal typing pauses, short enough
 *  that the pulse means what it says. */
const EDITING_CLEAR_MS = 8_000;

// projectId -> connectionId -> connection
const projects = new Map<string, Map<string, Conn>>();

export function addConnection(
  projectId: string,
  connectionId: string,
  identity: Identity,
  ws: Sender,
): void {
  let conns = projects.get(projectId);
  if (!conns) {
    conns = new Map();
    projects.set(projectId, conns);
  }
  conns.set(connectionId, {
    ws,
    entry: {
      connectionId,
      email: identity.email,
      name: identity.name,
      color: identity.color,
    },
  });
}

export function updateConnectionPresence(
  projectId: string,
  connectionId: string,
  view: PresenceView,
): void {
  const conn = projects.get(projectId)?.get(connectionId);
  if (!conn) return;
  conn.entry = {
    connectionId: conn.entry.connectionId,
    email: conn.entry.email,
    name: conn.entry.name,
    color: conn.entry.color,
    // avatarUrl is sticky once provided; the view fields are replaced wholesale
    // so a client can clear its slide/block by sending an update without them.
    avatarUrl: view.avatarUrl ?? conn.entry.avatarUrl,
    deckId: view.deckId,
    slideId: view.slideId,
    selectedBlockId: view.selectedBlockId,
    selectedTextTarget: view.selectedTextTarget,
    reportId: view.reportId,
    poId: view.poId,
    editingFigureId: view.editingFigureId,
    idle: view.idle,
    // Server-owned (markConnectionEditing) — a view update must not clear it.
    isEditing: conn.entry.isEditing,
  };
}

/**
 * Stamp `isEditing` on a connection because it just applied a document update
 * (slide/report/po). Broadcasts only on the false→true transition; every call
 * re-arms the quiet-period timer whose expiry broadcasts the clear — so a
 * continuous typing burst costs two presence broadcasts total, not one per
 * keystroke batch.
 */
export function markConnectionEditing(
  projectId: string,
  connectionId: string,
): void {
  const conn = projects.get(projectId)?.get(connectionId);
  if (!conn) return;
  if (conn.editingTimer !== undefined) clearTimeout(conn.editingTimer);
  conn.editingTimer = setTimeout(() => {
    conn.editingTimer = undefined;
    if (!conn.entry.isEditing) return;
    conn.entry = { ...conn.entry, isEditing: undefined };
    broadcastPresence(projectId);
  }, EDITING_CLEAR_MS);
  if (!conn.entry.isEditing) {
    conn.entry = { ...conn.entry, isEditing: true };
    broadcastPresence(projectId);
  }
}

export function removeConnection(projectId: string, connectionId: string): void {
  const conns = projects.get(projectId);
  if (!conns) return;
  const conn = conns.get(connectionId);
  if (conn?.editingTimer !== undefined) clearTimeout(conn.editingTimer);
  conns.delete(connectionId);
  if (conns.size === 0) projects.delete(projectId);
}

export function broadcastPresence(projectId: string): void {
  const conns = projects.get(projectId);
  if (!conns) return;
  const peers: PresenceEntry[] = [...conns.values()].map((c) => c.entry);
  const message: CollabServerMessage = {
    type: "presence_state",
    data: { peers },
  };
  const payload = JSON.stringify(message);
  for (const conn of conns.values()) {
    try {
      conn.ws.send(payload);
    } catch {
      // A dead socket is cleaned up by its own close/error handler.
    }
  }
}
