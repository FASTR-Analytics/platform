import { Hono } from "hono";
import { MODULE_REGISTRY, type ModuleLatestCommit } from "lib";
import { fetchCommits } from "../../github/fetch_module.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesInstanceModules = new Hono();

defineRoute(routesInstanceModules, "checkModuleUpdates", async (c) => {
  const results: ModuleLatestCommit[] = [];
  const errors: string[] = [];

  const fetches = MODULE_REGISTRY.map(async (mod) => {
    const { owner, repo, path } = mod.github;
    const res = await fetchCommits(owner, repo, path, "main");
    if (res.success && res.data.length > 0) {
      results.push({
        moduleId: mod.id,
        latestCommit: res.data[0],
      });
    } else if (!res.success) {
      errors.push(`${mod.id}: ${res.err}`);
    }
  });

  await Promise.all(fetches);

  if (results.length === 0 && errors.length > 0) {
    return c.json({ success: false, err: errors.join("; ") });
  }

  return c.json({ success: true, data: results });
});
