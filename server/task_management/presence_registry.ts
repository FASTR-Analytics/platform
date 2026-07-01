import type { CollabServerMessage, PresenceEntry, PresenceView } from "lib";

// In-process presence registry for the collab WebSocket. Single-process only
// (matches the in-process BroadcastChannel assumption elsewhere); horizontal
// scaling across instances is a later milestone (Valkey pub/sub).

type Sender = { send: (data: string) => void };
type Conn = { entry: PresenceEntry; ws: Sender };
type Identity = { email: string; name: string; color: string };

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
  };
}

export function removeConnection(projectId: string, connectionId: string): void {
  const conns = projects.get(projectId);
  if (!conns) return;
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
