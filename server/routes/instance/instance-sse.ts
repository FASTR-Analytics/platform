import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { InstanceSseMessage, InstanceState } from "lib";
import { getInstanceDatasetsSummary, getInstanceDetail, getInstanceIndicatorsSummary } from "../../db/mod.ts";
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
      let controller: ReadableStreamDefaultController<InstanceSseMessage> | null =
        null;

      const broadcastReceiver = new BroadcastChannel("instance_updates");
      broadcastReceiver.addEventListener(
        "message",
        (evt: MessageEvent<InstanceSseMessage>) => {
          if (controller) {
            controller.enqueue(evt.data);
          } else {
            queue.push(evt.data);
          }
        },
      );

      try {
        // 1. Build initial state from database (while queuing any concurrent messages)
        const res = await getInstanceDetail(mainDb, globalUser);
        if (!res.success) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "error",
              data: { message: res.err },
            }),
          });
          return;
        }

        const datasetsSummary = await getInstanceDatasetsSummary(mainDb);
        const indicatorsSummary = await getInstanceIndicatorsSummary(mainDb);

        const users = res.data.users;
        const me = users.find((u) => u.email === globalUser.email);

        const instanceState: InstanceState = {
          isReady: true,
          instanceName: res.data.instanceName,
          maxAdminArea: res.data.maxAdminArea,
          countryIso3: res.data.countryIso3,
          facilityColumns: res.data.facilityColumns,
          adminAreaLabels: res.data.adminAreaLabels,
          projects: res.data.projects,
          users,
          assets: res.data.assets,
          geojsonMaps: res.data.geojsonMaps,
          structure: res.data.structure,
          structureLastUpdated: res.data.structureLastUpdated,
          ...indicatorsSummary,
          ...datasetsSummary,
          currentUserEmail: globalUser.email,
          currentUserApproved: !!me,
          currentUserIsGlobalAdmin: me?.isGlobalAdmin ?? false,
          currentUserPermissions: me ? {
            can_configure_users: me.can_configure_users,
            can_view_users: me.can_view_users,
            can_view_logs: me.can_view_logs,
            can_configure_settings: me.can_configure_settings,
            can_configure_assets: me.can_configure_assets,
            can_configure_data: me.can_configure_data,
            can_view_data: me.can_view_data,
            can_create_projects: me.can_create_projects,
          } : {
            can_configure_users: false,
            can_view_users: false,
            can_view_logs: false,
            can_configure_settings: false,
            can_configure_assets: false,
            can_configure_data: false,
            can_view_data: false,
            can_create_projects: false,
          },
        };

        // 2. Send starting message with full state
        await stream.writeSSE({
          data: JSON.stringify({
            type: "starting",
            data: instanceState,
          } satisfies InstanceSseMessage),
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
            const { done, value } = await reader.read();
            if (done) break;
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
