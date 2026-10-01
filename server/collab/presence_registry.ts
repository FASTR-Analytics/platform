import {
  canUseScope,
  type CollabServerMessage,
  type PresenceEntry,
  type PresenceView,
  type ScopeAccess,
  scopeAccessEqual,
} from "lib";

// In-process presence registry for the collab WebSocket. Single-process only
// (matches the in-process BroadcastChannel assumption elsewhere); horizontal
// scaling across instances is a later milestone (Valkey pub/sub).
//
// Presence is scoped to the PRODUCT a peer has open, the deck (`deckId`) or
// report (`reportId`) it is editing, not to the connection at large
// (PLAN_PRODUCTS_RESTRUCTURE D8: there is no instance-wide page-awareness
// relay, no list-page cursors and no card presence avatars). A connection
// that is not inside a product belongs to no presence group and neither sends
// nor receives peer lists; opening one moves it, which broadcasts both the
// group it left and the group it joined.

type Sender = {
  send: (data: string) => void;
  close?: (code?: number, reason?: string) => void;
};
type Conn = {
  entry: PresenceEntry;
  ws: Sender;
  // Fixed at connect time, like the rest of the socket's authorization.
  scopeAccess: ScopeAccess;
  // The products a restricted connection passed the grant check for
  // (routes/instance/collab.ts). Rooms do not check membership on an update,
  // so this is what its edits and awareness are gated on.
  openedProducts: Set<string>;
  /** Pending clear of the server-stamped `isEditing` flag. */
  editingTimer?: ReturnType<typeof setTimeout>;
};
type Identity = {
  email: string;
  name: string;
  color: string;
  scopeAccess: ScopeAccess;
};

/** How long after the last applied doc update a connection still counts as
 *  "editing now". Long enough to bridge normal typing pauses, short enough
 *  that the pulse means what it says. */
const EDITING_CLEAR_MS = 8_000;

// connectionId -> connection. Flat: the presence GROUP is derived from the
// entry (productIdFor), so a peer moving between products is a field update
// here, not a re-registration.
const connections = new Map<string, Conn>();
// productId -> connectionIds currently in that product (the broadcast group).
const productGroups = new Map<string, Set<string>>();

/** The product this peer has open, or null when it is inside none. A client is
 *  only ever in one editor, so the two fields never both carry a value. */
function productIdFor(entry: PresenceEntry): string | null {
  return entry.deckId ?? entry.reportId ?? null;
}

function joinGroup(productId: string, connectionId: string): void {
  let group = productGroups.get(productId);
  if (!group) {
    group = new Set();
    productGroups.set(productId, group);
  }
  group.add(connectionId);
}

function leaveGroup(productId: string, connectionId: string): void {
  const group = productGroups.get(productId);
  if (!group) {
    return;
  }
  group.delete(connectionId);
  if (group.size === 0) {
    productGroups.delete(productId);
  }
}

export function addConnection(
  connectionId: string,
  identity: Identity,
  ws: Sender,
): void {
  // No product yet: the client's first presence_update places it, and that
  // is the first moment there is a group to broadcast.
  connections.set(connectionId, {
    ws,
    scopeAccess: identity.scopeAccess,
    openedProducts: new Set(),
    entry: {
      connectionId,
      email: identity.email,
      name: identity.name,
      color: identity.color,
    },
  });
}

/** Apply a peer's self-reported view and broadcast every group it affects:
 *  the one it left as well as the one it joined, so a peer leaving a deck
 *  disappears from the deck's peer list immediately. */
export function updateConnectionPresence(
  connectionId: string,
  view: PresenceView,
): void {
  const conn = connections.get(connectionId);
  if (!conn) {
    return;
  }
  const previousProductId = productIdFor(conn.entry);
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
    editingFigureId: view.editingFigureId,
    idle: view.idle,
    // Server-owned (markConnectionEditing): a view update must not clear it.
    isEditing: conn.entry.isEditing,
  };
  const productId = productIdFor(conn.entry);
  if (previousProductId === productId) {
    if (productId !== null) {
      broadcastPresence(productId);
    }
    return;
  }
  if (previousProductId !== null) {
    leaveGroup(previousProductId, connectionId);
    broadcastPresence(previousProductId);
  }
  if (productId !== null) {
    joinGroup(productId, connectionId);
    broadcastPresence(productId);
  }
}

/**
 * Stamp `isEditing` on a connection because it just applied a document update
 * (slide/report). Broadcasts only on the false to true transition; every call
 * re-arms the quiet-period timer whose expiry broadcasts the clear, so a
 * continuous typing burst costs two presence broadcasts total, not one per
 * keystroke batch.
 */
export function markConnectionEditing(connectionId: string): void {
  const conn = connections.get(connectionId);
  if (!conn) {
    return;
  }
  if (conn.editingTimer !== undefined) {
    clearTimeout(conn.editingTimer);
  }
  conn.editingTimer = setTimeout(() => {
    conn.editingTimer = undefined;
    if (!conn.entry.isEditing) {
      return;
    }
    conn.entry = { ...conn.entry, isEditing: undefined };
    broadcastPresenceForConnection(conn);
  }, EDITING_CLEAR_MS);
  if (!conn.entry.isEditing) {
    conn.entry = { ...conn.entry, isEditing: true };
    broadcastPresenceForConnection(conn);
  }
}

function broadcastPresenceForConnection(conn: Conn): void {
  const productId = productIdFor(conn.entry);
  if (productId !== null) {
    broadcastPresence(productId);
  }
}

/** False when the connection was closed while its grant check was in flight,
 *  in which case it must not be subscribed. */
export function markProductOpened(
  connectionId: string,
  productId: string,
): boolean {
  const conn = connections.get(connectionId);
  conn?.openedProducts.add(productId);
  return conn !== undefined;
}

/** False once the connection is closed or deregistered. */
export function hasOpenedProduct(
  connectionId: string,
  productId: string,
): boolean {
  return connections.get(connectionId)?.openedProducts.has(productId) ?? false;
}

/** Force-close every connection the predicate picks. A socket's
 *  authorization (its email, stamped into room-edit attribution, and its
 *  scope access) was frozen at connect time and cannot be patched in place,
 *  so the connection is closed and the client reconnects under its refreshed
 *  identity. Deregisters immediately (the socket's own close handler makes
 *  removeConnection a no-op later, and leaves its rooms) and broadcasts each
 *  affected product. */
function closeConnectionsWhere(
  shouldClose: (conn: Conn) => boolean,
  closeCode: number,
  reason: string,
): void {
  const touchedProductIds = new Set<string>();
  for (const [connectionId, conn] of [...connections]) {
    if (!shouldClose(conn)) {
      continue;
    }
    const productId = productIdFor(conn.entry);
    if (productId !== null) {
      leaveGroup(productId, connectionId);
      touchedProductIds.add(productId);
    }
    if (conn.editingTimer !== undefined) {
      clearTimeout(conn.editingTimer);
    }
    connections.delete(connectionId);
    try {
      conn.ws.close?.(closeCode, reason);
    } catch {
      // A dead socket is cleaned up by its own close/error handler.
    }
  }
  for (const productId of touchedProductIds) {
    broadcastPresence(productId);
  }
}

export function closeConnectionsForEmail(
  email: string,
  closeCode: number,
  reason: string,
): void {
  closeConnectionsWhere(
    (conn) => conn.entry.email === email,
    closeCode,
    reason,
  );
}

/** A product moved to `scopeId`: every connection that opened it and does not
 *  hold that scope is closed, so it leaves the product's rooms and its
 *  reconnect is refused the subscribe. */
export function closeConnectionsLosingProduct(
  productId: string,
  scopeId: string,
  closeCode: number,
  reason: string,
): void {
  closeConnectionsWhere(
    (conn) =>
      conn.openedProducts.has(productId) &&
      !canUseScope(conn.scopeAccess, scopeId),
    closeCode,
    reason,
  );
}

/** Closes every connection whose scope access differs from its user's row in
 *  `users` (a grant change, or an admin flag change, which changes access by
 *  definition). A connection whose user has no row is left alone. */
export function closeConnectionsWithChangedAccess(
  users: { email: string; scopeAccess: ScopeAccess }[],
  closeCode: number,
  reason: string,
): void {
  const accessByEmail = new Map(users.map((u) => [u.email, u.scopeAccess]));
  closeConnectionsWhere(
    (conn) => {
      const current = accessByEmail.get(conn.entry.email);
      return current !== undefined &&
        !scopeAccessEqual(current, conn.scopeAccess);
    },
    closeCode,
    reason,
  );
}

export function removeConnection(connectionId: string): void {
  const conn = connections.get(connectionId);
  if (!conn) {
    return;
  }
  if (conn.editingTimer !== undefined) {
    clearTimeout(conn.editingTimer);
  }
  connections.delete(connectionId);
  const productId = productIdFor(conn.entry);
  if (productId !== null) {
    leaveGroup(productId, connectionId);
    broadcastPresence(productId);
  }
}

function broadcastPresence(productId: string): void {
  const group = productGroups.get(productId);
  if (!group) {
    return;
  }
  const members: Conn[] = [];
  for (const connectionId of group) {
    const conn = connections.get(connectionId);
    if (conn) {
      members.push(conn);
    }
  }
  const message: CollabServerMessage = {
    type: "presence_state",
    data: { peers: members.map((c) => c.entry) },
  };
  const payload = JSON.stringify(message);
  for (const conn of members) {
    try {
      conn.ws.send(payload);
    } catch {
      // A dead socket is cleaned up by its own close/error handler.
    }
  }
}
