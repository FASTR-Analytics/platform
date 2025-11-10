import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { ProjectSseUpdateMessage } from "lib";
import { ProjectPk } from "../../server_only_types/mod.ts";
import { getProjectDirtyStates } from "../../task_management/mod.ts";

export const routesProjectSSE = new Hono();

// Project dirty states - Server-Sent Events endpoint
routesProjectSSE.get("/project_dirty_states/:project_id", async (c) => {
  const projectId = c.req.param("project_id");
  const projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_ONLY");
  const ppk: ProjectPk = {
    projectDb,
    projectId,
  };
  const resPds = await getProjectDirtyStates(ppk);
  if (resPds.success === false) {
    return c.json(resPds);
  }
  return streamSSE(c, async (stream) => {
    const bm1: ProjectSseUpdateMessage = {
      projectId,
      type: "starting_project_dirty_states",
      pds: resPds.data,
    };
    await stream.writeSSE({
      data: JSON.stringify(bm1),
    });
    const broadcastReceiver = new BroadcastChannel("dirty_states");
    const rs = new ReadableStream<ProjectSseUpdateMessage>({
      start(controller) {
        broadcastReceiver.addEventListener(
          "message",
          (evt: MessageEvent<ProjectSseUpdateMessage>) => {
            controller.enqueue(evt.data);
          }
        );
      },
      cancel() {
        broadcastReceiver.close();
      },
    });
    const reader = rs.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.projectId !== projectId) {
          continue;
        }
        await stream.writeSSE({
          data: JSON.stringify(value),
        });
      }
    } finally {
      reader.releaseLock();
      await rs.cancel();
    }
  });
});