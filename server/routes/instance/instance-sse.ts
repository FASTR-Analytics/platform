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

        // Per-user message filter (Q-B ruling): this endpoint is guarded by
        // requireGlobalPermission() — every logged-in user — but the
        // results-package generation messages carry run labels, module ids
        // and R error detail, which are for instance data admins only. The
        // permission set is the one captured for this connection; a
        // permission change takes effect on reconnect, exactly like the
        // currentUserPermissions in the starting payload above.
        const canSeeRunMessages = instanceState.currentUserIsGlobalAdmin ||
          instanceState.currentUserPermissions.can_configure_data;
        const shouldForward = (msg: InstanceSseMessage): boolean =>
          canSeeRunMessages ||
          (msg.type !== "run_progress" && msg.type !== "r_script");

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
            if (!shouldForward(value)) continue;
            await stream.writeSSE({
              data: JSON.stringify(value),
            });
          }
        } finally {
          reader.releaseLock();
          await rs.cancel();
        }
      } catch (err) {
        await stream.writeSSE({
          data: JSON.stringify({
            type: "error",
            data: {
              message: err instanceof Error ? err.message : "Unknown error",
            },
          }),
        });
      } finally {
        broadcastReceiver.close();
      }
    });
  },
);
