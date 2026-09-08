import { Hono } from "hono";
import { upgradeWebSocket } from "hono/deno";
import {
  type CollabClientMessage,
  collabClientMessageSchema,
  type CollabServerMessage,
  dropStorageInvalidTransientsInFigures,
  dropStorageInvalidTransientsInSlide,
  presenceColorForKey,
  reportFiguresSchema,
  reportImagesSchema,
  type Slide,
  slideConfigSchema,
  storedMatchesDoc,
} from "lib";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { _SERVER_VERSION } from "../../exposed_env_vars.ts";
import { _CLIENT_ORIGINS } from "../../exposed_env_vars.ts";
import { getGlobalUser } from "../../auth/global_user.ts";
import {
  getSlide,
  getSlideCrdtState,
  saveSlideCheckpoint,
} from "../../db/products/slides.ts";
import {
  getReportBodyAuthors,
  getReportCrdtState,
  getReportDetail,
  saveReportCheckpoint,
} from "../../db/products/reports.ts";
import {
  getAuthorRuns,
  stashPersistedAuthors,
} from "../../collab/authorship.ts";
import {
  addConnection,
  markConnectionEditing,
  removeConnection,
  updateConnectionPresence,
} from "../../collab/presence_registry.ts";
import {
  notifyInstanceLastUpdated,
  notifyInstanceProductsUpserted,
} from "../../task_management/notify_instance_updated.ts";
import {
  applySlideUpdate,
  handleConnGone,
  relayAwareness,
  type RoomConn,
  type SlideRoomDeps,
  subscribeSlide,
  unsubscribeSlide,
} from "../../collab/slide_rooms.ts";
import {
  applyReportUpdate,
  relayReportAwareness,
  type ReportRoomDeps,
  subscribeReport,
  unsubscribeReport,
} from "../../collab/report_rooms.ts";
import {
  noteVersionRoomEmpty,
  recordVersionEdit,
} from "../../collab/version_capture.ts";
import { recordSlideEdited } from "../../collab/deck_session_ledger.ts";

type CollabAuth = {
  email: string;
  name: string;
  color: string;
};

/**
 * Close code for "you are not allowed on this socket": a permanent condition
 * the client must not retry (see collab.ts's onclose). Sent AFTER accepting the
 * upgrade, because a pre-upgrade HTTP status is invisible to browser JS: the
 * WebSocket API surfaces a refused handshake as an unreadable 1006, which is
 * indistinguishable from a network drop and so retried forever.
 */
export const COLLAB_CLOSE_UNAUTHORIZED = 4403;

export const routesCollab = new Hono<
  {
    Variables: {
      collabAuth: CollabAuth;
      /** Set instead of collabAuth when the connection must be refused. */
      collabDenial: string;
    };
  }
>();

// Reject any frame bigger than this without parsing it (abuse/corruption
// guard). The largest legitimate client frames are reconnect push-backs of
// figure-bundle updates: low single-digit MB of base64, so 32 MiB leaves an
// order of magnitude of headroom while bounding per-frame memory.
const MAX_FRAME_CHARS = 32 * 1024 * 1024;

// WS handshakes are not subject to CORS, and the socket authenticates via
// ambient cookies: without this check any website could open an authenticated
// collab socket in a visitor's browser. Same allowlist as the HTTP CORS
// middleware, plus the same-origin case (production serves the SPA itself).
// Requests WITHOUT an Origin header pass: non-browser clients don't carry
// ambient browser credentials.
function isAllowedWsOrigin(
  origin: string,
  host: string | undefined,
): boolean {
  if (_CLIENT_ORIGINS.includes(origin)) {
    return true;
  }
  try {
    return host !== undefined && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * The instance collaboration WebSocket.
 *
 * Carries presence plus the two CRDT document families (slide_* / report_*).
 * Admission is origin plus Clerk plus approved (PLAN_PRODUCTS_RESTRUCTURE D2,
 * D8) and resolves BEFORE the upgrade so the socket can never become an
 * unauthenticated channel. Every document message names its product, which
 * keys the room and is where a later per-product check slots in; today every
 * approved user is a full editor of every product, so an admitted connection
 * may subscribe to and edit any slide or report. Presence is scoped to the
 * product a peer has open (presence_registry.ts) and carries no document
 * content: identity plus opaque ids.
 *
 * Authorization failures are refused with a post-upgrade
 * COLLAB_CLOSE_UNAUTHORIZED close so the client can tell "never allowed" from
 * "try again"; only the Origin check (never upgrade for a foreign origin) and
 * the retryable 503 stay pre-upgrade HTTP responses.
 */
routesCollab.get(
  "/collab",
  async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && !isAllowedWsOrigin(origin, c.req.header("host"))) {
      c.status(403);
      return c.json({ success: false, err: "Origin not allowed" });
    }

    // Denials from here on are surfaced as a post-upgrade close, not an HTTP
    // status: browsers cannot read a refused handshake, so the client would
    // retry a permanent failure forever.
    function deny(reason: string) {
      c.set("collabDenial", reason);
    }

    let globalUser;
    try {
      globalUser = await getGlobalUser(c);
    } catch (error) {
      // Retryable: stays a pre-upgrade status so the client keeps its normal
      // reconnect behaviour.
      console.error("[collab] failed to resolve the connecting user:", error);
      c.status(503);
      return c.json({
        success: false,
        err: "Service temporarily unavailable",
      });
    }
    if (globalUser === "NOT_AUTHENTICATED") {
      deny("Authentication required");
      return await next();
    }
    if (!globalUser.approved) {
      deny("User is not approved");
      return await next();
    }

    const name = `${globalUser.firstName} ${globalUser.lastName}`.trim() ||
      globalUser.email;
    c.set("collabAuth", {
      email: globalUser.email,
      name,
      color: presenceColorForKey(globalUser.email),
    });
    await next();
  },
  upgradeWebSocket((c) => {
    // Refused connections are accepted and then closed with a code the client
    // can read, so it can stop retrying instead of hammering a permanent
    // failure. Nothing is registered: no presence, no rooms.
    const denial = c.get("collabDenial") as string | undefined;
    if (denial) {
      return {
        onOpen: (_evt: Event, ws: { close: (code?: number, reason?: string) => void }) => {
          ws.close(COLLAB_CLOSE_UNAUTHORIZED, denial);
        },
      };
    }
    const auth = c.get("collabAuth") as CollabAuth;
    const connectionId = crypto.randomUUID();
    // One RoomConn for both families: the room registry keys by connectionId,
    // and edit permission no longer varies by family or document.
    let roomConn: RoomConn | null = null;
    // Liveness for the rooms' post-load re-check (see RoomConn.isLive): a
    // socket that dies while a first-subscribe load is in flight must not be
    // registered as a room member afterwards.
    let socketGone = false;

    // DB-backed room dependencies for one slide of one deck product. The
    // checkpoint re-broadcasts the deck's summary (its card and its detail
    // cache version derive from the row it just wrote) and version capture
    // records against the DECK (whole-deck versions). A failed re-read only
    // costs the refresh, never the save: notifyInstanceProductsUpserted logs
    // and returns.
    function depsForSlide(productId: string, slideId: string): SlideRoomDeps {
      const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
      return {
        loadSlide: async () => {
          const res = await getSlide(mainDb, productId, slideId);
          if (!res.success) {
            return null;
          }
          const crdtRes = await getSlideCrdtState(mainDb, productId, slideId);
          const crdtState = crdtRes.success ? crdtRes.data.state : null;
          return { slide: res.data.slide, crdtState };
        },
        saveSlide: async (slide, crdtState) => {
          // Collab is authoritative → checkpoint overwrites config + CRDT state.
          // Validation lives HERE, not in the DB write: a schema rejection is
          // PERMANENT for this doc state (same input parses the same way
          // forever), so the room must not timer-retry it: see DocSaveResult.
          // The stored copy drops schema-invalid transients from EMBEDDED
          // figures: the figure modal streams a mid-edit config straight into
          // this doc, and a filter chip with every value un-ticked is legal
          // mid-edit but fails the strict parse, which would wedge the room's
          // checkpoint permanently (observed 2026-07-23).
          let stored: Slide;
          try {
            stored = slideConfigSchema.parse(
              dropStorageInvalidTransientsInSlide(slide),
            ) as Slide;
          } catch (err) {
            console.error(
              `[collab] slide checkpoint validation failed for ${slideId}`,
              err,
            );
            return { ok: false, permanent: true };
          }
          // Trust the CRDT state only when the doc materializes to exactly
          // what we store: parse-stripped keys would otherwise diverge doc
          // from row while stamped current, and every editor open would adopt
          // the divergent doc (the "viz flip" bug class, 2026-07-24).
          // storedMatchesDoc also rejects a doc holding values JSON cannot
          // represent, which a plain canonicalJson compare cannot see.
          const trusted = storedMatchesDoc(stored, slide);
          const res = await saveSlideCheckpoint(
            mainDb,
            productId,
            slideId,
            stored,
            crdtState,
            trusted,
          );
          if (!res.success) {
            return { ok: false };
          }
          notifyInstanceLastUpdated("slides", [slideId], res.data.lastUpdated);
          await notifyInstanceProductsUpserted(mainDb, [productId]);
          return { ok: true, lastUpdated: res.data.lastUpdated };
        },
        onEdit: (editor) => {
          recordVersionEdit("deck", productId, editor);
          recordSlideEdited(productId, slideId, editor.email);
        },
        onEmpty: () => noteVersionRoomEmpty("deck", productId),
      };
    }

    // DB-backed room dependencies for one report product (see depsForSlide).
    function depsForReport(productId: string): ReportRoomDeps {
      const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
      return {
        load: async () => {
          const res = await getReportDetail(mainDb, productId);
          if (!res.success) {
            return null;
          }
          const crdtRes = await getReportCrdtState(mainDb, productId);
          const crdtState = crdtRes.success ? crdtRes.data.state : null;
          // Authorship ledger: hand the persisted runs to the room's observer
          // (consumed when the doc is created; only valid alongside a current
          // crdt_state: a re-seeded doc starts with unknown authorship).
          const authorsRes = await getReportBodyAuthors(mainDb, productId);
          stashPersistedAuthors(
            productId,
            crdtState !== null && authorsRes.success
              ? authorsRes.data.authors
              : null,
          );
          return {
            content: {
              body: res.data.body,
              figures: res.data.figures,
              images: res.data.images,
            },
            crdtState,
          };
        },
        save: async (content, crdtState) => {
          // Collab is authoritative → checkpoint overwrites content + CRDT state.
          // Validation lives HERE (see the slide closure): schema rejection is
          // permanent for this doc state: no timer retry. The body is a plain
          // string (no parse); figures/images are the parsed surfaces. Figures
          // drop embedded schema-invalid transients (see the slide closure).
          let storedFigures: typeof content.figures;
          let storedImages: typeof content.images;
          try {
            storedFigures = reportFiguresSchema.parse(
              dropStorageInvalidTransientsInFigures(content.figures),
            );
            storedImages = reportImagesSchema.parse(content.images);
          } catch (err) {
            console.error(
              `[collab] report checkpoint validation failed for ${productId}`,
              err,
            );
            return { ok: false, permanent: true };
          }
          // Trust the CRDT state only when the doc materializes to exactly
          // what we store (parse-stripped keys → untrusted → re-seed next
          // open). Body is stored verbatim, so only figures/images can differ.
          const trusted =
            storedMatchesDoc(storedFigures, content.figures) &&
            storedMatchesDoc(storedImages, content.images);
          const res = await saveReportCheckpoint(
            mainDb,
            productId,
            { body: content.body, figures: storedFigures, images: storedImages },
            crdtState,
            getAuthorRuns(productId, content.body),
            trusted,
          );
          if (!res.success) {
            return { ok: false };
          }
          // A report IS the product, so its summary (hasEmbeds included) is
          // the whole notification: there is no separate stamp to emit.
          await notifyInstanceProductsUpserted(mainDb, [productId]);
          return { ok: true, lastUpdated: res.data.lastUpdated };
        },
        onEdit: (editor) => recordVersionEdit("report", productId, editor),
        onEmpty: () => noteVersionRoomEmpty("report", productId),
      };
    }

    return {
      onOpen: (_evt, ws) => {
        roomConn = {
          connectionId,
          // Always TRUE: every approved user is a full editor of every product
          // (D2). The field is kept rather than removed so a later permission
          // model slots in where the conn is built, instead of being
          // re-threaded through doc_rooms, both adapters and every error path.
          canEdit: true,
          identity: { email: auth.email, name: auth.name },
          send: (msg: CollabServerMessage) => ws.send(JSON.stringify(msg)),
          isLive: () => !socketGone,
        };
        addConnection(connectionId, auth, ws);
        const hello: CollabServerMessage = {
          type: "hello",
          data: { connectionId, serverVersion: _SERVER_VERSION },
        };
        ws.send(JSON.stringify(hello));
      },
      onMessage: (evt, ws) => {
        if (typeof evt.data !== "string") {
          return;
        }
        // Frame-size cap, checked before parsing: bounds per-frame memory
        // against abuse (MAX_FRAME_CHARS doc above). The client logs the
        // error message; nothing legitimate comes close to the limit.
        if (evt.data.length > MAX_FRAME_CHARS) {
          const err: CollabServerMessage = {
            type: "error",
            data: { message: "Frame too large" },
          };
          ws.send(JSON.stringify(err));
          return;
        }
        // Schema-validate every frame before any handler touches it: the
        // handlers below dereference msg.data fields directly, and the schema
        // also bounds presence/awareness payload sizes (see lib/types/collab.ts).
        let msg: CollabClientMessage;
        try {
          const parsed = collabClientMessageSchema.safeParse(
            JSON.parse(evt.data),
          );
          if (!parsed.success) {
            const err: CollabServerMessage = {
              type: "error",
              data: { message: "Invalid message" },
            };
            ws.send(JSON.stringify(err));
            return;
          }
          msg = parsed.data;
        } catch (err) {
          console.error(`[collab] malformed WS frame from ${connectionId}`, err);
          const parseErr: CollabServerMessage = {
            type: "error",
            data: { message: "Invalid message" },
          };
          ws.send(JSON.stringify(parseErr));
          return;
        }
        // The po_* family and project_awareness_update belong to the project
        // socket and are not handled here: they fall through the switch.
        switch (msg.type) {
          case "ping": {
            // Client-side liveness probe (see lib/types/collab.ts). The reply
            // is the point: the client's watchdog force-closes a socket that
            // gets no traffic back.
            const pong: CollabServerMessage = { type: "pong" };
            ws.send(JSON.stringify(pong));
            break;
          }
          case "presence_update":
            // Broadcasts the product this peer left and the one it joined:
            // the registry owns both, since only it knows the previous view.
            updateConnectionPresence(connectionId, msg.data);
            break;
          case "slide_subscribe":
            if (roomConn) {
              void subscribeSlide(
                msg.data.productId,
                msg.data.slideId,
                roomConn,
                msg.data.stateVector,
                depsForSlide(msg.data.productId, msg.data.slideId),
              );
            }
            break;
          case "slide_update":
            if (roomConn) {
              applySlideUpdate(
                msg.data.productId,
                msg.data.slideId,
                roomConn,
                msg.data.update,
              );
              markConnectionEditing(connectionId);
            }
            break;
          case "slide_unsubscribe":
            if (roomConn) {
              unsubscribeSlide(msg.data.productId, msg.data.slideId, roomConn);
            }
            break;
          case "awareness_update":
            if (roomConn) {
              relayAwareness(
                msg.data.productId,
                msg.data.slideId,
                roomConn,
                msg.data.update,
              );
            }
            break;
          case "report_subscribe":
            if (roomConn) {
              void subscribeReport(
                msg.data.productId,
                msg.data.reportId,
                roomConn,
                msg.data.stateVector,
                depsForReport(msg.data.productId),
              );
            }
            break;
          case "report_update":
            if (roomConn) {
              applyReportUpdate(
                msg.data.productId,
                msg.data.reportId,
                roomConn,
                msg.data.update,
              );
              markConnectionEditing(connectionId);
            }
            break;
          case "report_unsubscribe":
            if (roomConn) {
              unsubscribeReport(msg.data.productId, msg.data.reportId, roomConn);
            }
            break;
          case "report_awareness_update":
            if (roomConn) {
              relayReportAwareness(
                msg.data.productId,
                msg.data.reportId,
                roomConn,
                msg.data.update,
              );
            }
            break;
        }
      },
      onClose: () => {
        socketGone = true;
        removeConnection(connectionId);
        handleConnGone(connectionId);
      },
      onError: () => {
        socketGone = true;
        removeConnection(connectionId);
        handleConnGone(connectionId);
      },
    };
  }, {
    // Server-side dead-peer detection: Deno pings every client at the
    // protocol level and closes the connection (firing onClose/onError above,
    // which run all presence/room cleanup) when no pong arrives within this
    // many SECONDS. 30 is Deno's own default: pinned here so the contract is
    // explicit rather than inherited, and survives a runtime default change.
    // The client-side mirror (browsers can't see protocol pings) is the
    // ping/pong watchdog in client/src/state/instance/collab.ts.
    idleTimeout: 30,
  }),
);
