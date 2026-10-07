import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  type Folder,
  type GlobalUser,
  type InstanceSseMessage,
  type InstanceState,
  permissionsUnderScopeAccess,
  type ProductSummary,
  scopeAccessEqual,
  type ScopeId,
} from "lib";
import {
  holdsProductLevel,
  visibleFolderIds,
} from "../../auth/product_access.ts";
import { listFolders } from "../../db/products/folders.ts";
import { buildInstanceState } from "../../task_management/build_instance_state.ts";
import { requireGlobalPermission } from "../../middleware/userPermission.ts";

export const routesInstanceSSE = new Hono();

export type InstanceSseFilterDeps = {
  // Every folder, unfiltered: a restricted connection's visible folders are
  // recomputed from it (R23).
  allFolders: Folder[];
};

export type InstanceSseFilterResult = {
  messages: InstanceSseMessage[];
  // The stream ends after these messages, and the client's reconnect
  // rebuilds its payload: the connection's own scope access or admin flag
  // changed (R29), or a product it lost became visible again while its slide
  // stamps were withheld.
  close: boolean;
};

// The per-connection forward filter, seeded from the `starting` payload this
// connection was sent. Rules, all LIVE off the same re-derivation (every
// `users_updated` carries the full roster, and the connection's own email
// never changes, so re-finding it in each roster is sufficient):
//   - Q-B: `run_progress`/`r_script` (run labels, module ids, R error detail)
//     go to instance data admins only: a mid-session grant starts the stream,
//     a revocation stops it, no reconnect. A restricted user is never one
//     (R26).
//   - Roster: an UNAPPROVED connection (its user absent from the roster) gets
//     `users_updated` rewritten to `[]`: the roster is an enumeration surface
//     (emails, names, permission maps) with no consumer on the pending-approval
//     screen. The moment the user appears in a roster payload, that same
//     message flows through whole, and the client's own-email re-derivation
//     flips them approved and fills the roster in one step. The starting
//     payload applies the same rule (buildInstanceState).
//   - Product plane: the same absent-from-roster test drops
//     `products_upserted` / `products_deleted` / `folders_updated` /
//     `scopes_updated` / `last_updated`, matching the withholding
//     buildInstanceState applies to the starting payload. A revoked user stops
//     receiving products on the next `users_updated` without a reconnect; the
//     unapproved-to-approved fill is the client's reconnect (D8).
//   - Visibility (PLAN_PRODUCT_OWNERSHIP §2.7): a connection that is not a
//     global admin gets only the products it can see, by scope and level
//     (holdsProductLevel at view). A visible upserted row is forwarded and
//     remembered as held; a held row that is no longer visible is rewritten
//     as a deletion and remembered as withdrawn; a row neither visible nor
//     held is dropped. A withdrawn product that becomes visible again ends
//     the stream, since its slide stamps were withheld meanwhile. A slide
//     stamp passes when its deck is held.
//   - Grants (PLAN_SCOPES §2.6): a RESTRICTED connection's scopes are cut to
//     the granted ones, and its folder list is recomputed on every product or
//     folder message and sent when it changes.
//   - A change to the connection's own scope access or admin flag ends the
//     stream.
export type InstanceSseFilterStart = Pick<
  InstanceState,
  | "currentUserEmail"
  | "currentUserApproved"
  | "currentUserIsGlobalAdmin"
  | "currentUserPermissions"
  | "currentUserScopeAccess"
  | "products"
  | "folders"
>;

export function createInstanceSseFilter(
  start: InstanceSseFilterStart,
  deps: InstanceSseFilterDeps,
): (msg: InstanceSseMessage) => InstanceSseFilterResult {
  let viewer: Pick<GlobalUser, "email" | "isGlobalAdmin" | "scopeAccess"> = {
    email: start.currentUserEmail,
    isGlobalAdmin: start.currentUserIsGlobalAdmin,
    scopeAccess: start.currentUserScopeAccess,
  };
  let canSeeRunMessages = start.currentUserIsGlobalAdmin ||
    start.currentUserPermissions.can_configure_data;
  let isApproved = start.currentUserApproved;
  let allFolders = deps.allFolders;
  // The connection's own copy of what it holds (product id to folder id),
  // and the products this filter took away from it.
  const held = new Map(start.products.map((p) => [p.id, p.folderId]));
  const withdrawn = new Set<string>();
  let sentFolders = JSON.stringify(start.folders);

  function folderMessage(): InstanceSseMessage[] {
    if (viewer.scopeAccess.all) return [];
    const ids = visibleFolderIds(allFolders, [...held.values()]);
    const folders = allFolders.filter((f) => ids.has(f.id));
    const json = JSON.stringify(folders);
    if (json === sentFolders) return [];
    sentFolders = json;
    return [{ type: "folders_updated", data: { folders } }];
  }

  const pass = (msg: InstanceSseMessage): InstanceSseFilterResult => ({
    messages: [msg],
    close: false,
  });
  const drop: InstanceSseFilterResult = { messages: [], close: false };

  return (msg) => {
    if (msg.type === "users_updated") {
      const me = msg.data.find((u) => u.email === viewer.email);
      const next = {
        email: viewer.email,
        isGlobalAdmin: me?.isGlobalAdmin ?? viewer.isGlobalAdmin,
        scopeAccess: me?.scopeAccess ?? viewer.scopeAccess,
      };
      const myPermissions = me === undefined
        ? undefined
        : permissionsUnderScopeAccess(me, next.scopeAccess);
      canSeeRunMessages = (me?.isGlobalAdmin ?? false) ||
        (myPermissions?.can_configure_data ?? false);
      isApproved = me !== undefined;
      const changed = !scopeAccessEqual(next.scopeAccess, viewer.scopeAccess) ||
        next.isGlobalAdmin !== viewer.isGlobalAdmin;
      viewer = next;
      return {
        messages: [
          me === undefined ? { type: "users_updated", data: [] } : msg,
        ],
        close: changed,
      };
    }
    if (msg.type === "run_progress" || msg.type === "r_script") {
      return canSeeRunMessages ? pass(msg) : drop;
    }
    const productPlane = msg.type === "products_upserted" ||
      msg.type === "products_deleted" ||
      msg.type === "folders_updated" ||
      msg.type === "scopes_updated" ||
      msg.type === "last_updated";
    if (!productPlane) return pass(msg);
    if (!isApproved) return drop;
    if (viewer.isGlobalAdmin) return pass(msg);
    switch (msg.type) {
      case "products_upserted": {
        const visible: ProductSummary[] = [];
        const lost: string[] = [];
        let returned = false;
        for (const p of msg.data.products) {
          if (holdsProductLevel(viewer, p.scopeId, p, "view")) {
            returned ||= withdrawn.has(p.id);
            held.set(p.id, p.folderId);
            visible.push(p);
          } else if (held.delete(p.id)) {
            withdrawn.add(p.id);
            lost.push(p.id);
          }
        }
        return {
          messages: [
            ...(visible.length > 0
              ? [{
                type: "products_upserted" as const,
                data: { products: visible },
              }]
              : []),
            ...(lost.length > 0
              ? [{ type: "products_deleted" as const, data: { ids: lost } }]
              : []),
            ...folderMessage(),
          ],
          close: returned,
        };
      }
      case "products_deleted": {
        for (const id of msg.data.ids) {
          held.delete(id);
          withdrawn.delete(id);
        }
        return { messages: [msg, ...folderMessage()], close: false };
      }
      case "folders_updated": {
        if (viewer.scopeAccess.all) return pass(msg);
        allFolders = msg.data.folders;
        return { messages: folderMessage(), close: false };
      }
      case "scopes_updated": {
        const access = viewer.scopeAccess;
        if (access.all) return pass(msg);
        const granted: ReadonlySet<ScopeId> = new Set(access.scopeIds);
        return pass({
          type: "scopes_updated",
          data: { scopes: msg.data.scopes.filter((s) => granted.has(s.id)) },
        });
      }
      case "last_updated":
        return held.has(msg.data.productId) ? pass(msg) : drop;
    }
  };
}

routesInstanceSSE.get(
  "/instance_updates",
  requireGlobalPermission(),
  async (c) => {
    const mainDb = c.var.mainDb;
    const globalUser = c.var.globalUser;

    return streamSSE(c, async (stream) => {
      // Single BroadcastChannel with one listener that switches between
      // queuing (during initial build) and streaming (after drain).
      const queue: InstanceSseMessage[] = [];
      let controller:
        | ReadableStreamDefaultController<InstanceSseMessage>
        | null = null;

      const broadcastReceiver = new BroadcastChannel("instance_updates");
      broadcastReceiver.addEventListener(
        "message",
        (evt: MessageEvent<InstanceSseMessage>) => {
          if (stream.aborted) return;
          if (controller) {
            controller.enqueue(evt.data);
          } else {
            queue.push(evt.data);
          }
        },
      );

      // A write to a disconnected client never throws on this hono version
      // (StreamingApi.write swallows errors), so the read loop below can only
      // exit via the abort signal: closing the controller makes reader.read()
      // return done. Without it the loop parks forever and the
      // BroadcastChannel subscription leaks. controller may still be null
      // here (abort during build): the aborted checks after the build and at
      // the top of the loop cover that window.
      stream.onAbort(() => {
        if (controller) {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      });

      try {
        // 1. Build initial state from database (while queuing any concurrent
        // messages). buildInstanceState is the full payload; the /mcp context
        // cache grounds on its product-free half
        // (buildInstanceStateWithoutProducts).
        const res = await buildInstanceState(mainDb, globalUser);
        if (!res.success) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "error",
              data: { message: res.err },
            }),
          });
          return;
        }

        if (stream.aborted) return;

        const instanceState: InstanceState = res.data;

        // 2. Send starting message with full state
        await stream.writeSSE({
          data: JSON.stringify(
            {
              type: "starting",
              data: instanceState,
            } satisfies InstanceSseMessage,
          ),
        });

        // Every logged-in user, approved or not, reaches this endpoint
        // (requireGlobalPermission()); createInstanceSseFilter holds the
        // per-message rules. Only a restricted connection needs the full
        // folder list.
        const allFoldersRes = instanceState.currentUserScopeAccess.all
          ? undefined
          : await listFolders(mainDb);
        const forwardable = createInstanceSseFilter(instanceState, {
          allFolders: allFoldersRes?.success ? allFoldersRes.data : [],
        });

        // 3. Create ReadableStream and switch listener to stream mode
        const rs = new ReadableStream<InstanceSseMessage>({
          start(c) {
            controller = c;
          },
          cancel() {
            broadcastReceiver.close();
          },
        });

        // 4. Drain any queued messages that arrived during build
        for (const msg of queue) {
          controller!.enqueue(msg);
        }
        queue.length = 0;

        // 5. Forward all subsequent messages
        const reader = rs.getReader();
        try {
          while (true) {
            if (stream.aborted) break;
            const { done, value } = await reader.read();
            if (done) break;
            const outgoing = forwardable(value);
            for (const msg of outgoing.messages) {
              await stream.writeSSE({ data: JSON.stringify(msg) });
            }
            if (outgoing.close) break;
          }
        } finally {
          reader.releaseLock();
          await rs.cancel();
        }
      } catch (err) {
        // Generic on the wire: this connection may be an unapproved user, and
        // buildInstanceState's summary reads are unwrapped: a raw driver
        // message must not reach the SSE stream. The real error goes to the
        // server log.
        console.error("[instance-sse] failed to build instance state:", err);
        await stream.writeSSE({
          data: JSON.stringify({
            type: "error",
            data: { message: "Failed to build instance state" },
          }),
        });
      } finally {
        broadcastReceiver.close();
      }
    });
  },
);
