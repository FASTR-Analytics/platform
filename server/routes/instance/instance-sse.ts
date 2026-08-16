import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { InstanceSseMessage, InstanceState } from "lib";
import { buildInstanceState } from "../../task_management/build_instance_state.ts";
import { requireGlobalPermission } from "../../middleware/userPermission.ts";

export const routesInstanceSSE = new Hono();

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
      // here (abort during build) — the aborted checks after the build and at
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
        // messages). Extracted to buildInstanceState (PLAN_112 step 3) so the
        // /mcp context cache grounds on the same state — payload unchanged.
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

        // Per-user message filter: this endpoint is guarded by
        // requireGlobalPermission() — every logged-in user, approved or not.
        // Two per-message rules, both LIVE (every `users_updated` passing
        // through the forward loop carries the full roster with permission
        // rows, and the connection's own email never changes, so re-finding
        // it in each roster is sufficient):
        //   - Q-B: `run_progress`/`r_script` (run labels, module ids, R error
        //     detail) go to instance data admins only — a mid-session grant
        //     starts the stream, a revocation stops it, no reconnect.
        //   - Roster: an UNAPPROVED connection (its user absent from the
        //     roster) gets `users_updated` rewritten to `[]` — the roster is
        //     an enumeration surface (emails, names, permission maps) with no
        //     consumer on the pending-approval screen. The moment the user
        //     appears in a roster payload, that same message flows through
        //     whole, and the client's own-email re-derivation flips them
        //     approved and fills the roster in one step. The starting payload
        //     applies the same rule (buildInstanceState).
        // Returns the message to write (possibly rewritten) or null to drop.
        let canSeeRunMessages = instanceState.currentUserIsGlobalAdmin ||
          instanceState.currentUserPermissions.can_configure_data;
        const forwardable = (
          msg: InstanceSseMessage,
        ): InstanceSseMessage | null => {
          if (msg.type === "users_updated") {
            const me = msg.data.find(
              (u) => u.email === instanceState.currentUserEmail,
            );
            canSeeRunMessages = (me?.isGlobalAdmin ?? false) ||
              (me?.can_configure_data ?? false);
            return me === undefined ? { type: "users_updated", data: [] } : msg;
          }
          if (msg.type === "run_progress" || msg.type === "r_script") {
            return canSeeRunMessages ? msg : null;
          }
          return msg;
        };

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
            if (outgoing === null) continue;
            await stream.writeSSE({
              data: JSON.stringify(outgoing),
            });
          }
        } finally {
          reader.releaseLock();
          await rs.cancel();
        }
      } catch (err) {
        // Generic on the wire: this connection may be an unapproved user, and
        // buildInstanceState's summary reads are unwrapped — a raw driver
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
