import { Hono } from "hono";
import {
  MODULE_REGISTRY,
  type CompareProjectsData,
  type CompareProjectsModule,
  type ModuleLatestCommit,
} from "lib";
import { getPgConnectionFromCacheOrNew } from "../../db/postgres/mod.ts";
import { type DBModule } from "../../db/project/_project_database_types.ts";
import { parseModuleConfigSelections } from "../../db/project/modules.ts";
import { fetchCommits } from "../../github/fetch_module.ts";
import { requireGlobalPermission } from "../../middleware/userPermission.ts";
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

defineRoute(
  routesInstanceModules,
  "compareProjects",
  requireGlobalPermission({ requireAdmin: true }),
  async (c) => {
    const projects: { id: string; label: string }[] = await c.var.mainDb`
      SELECT id, label FROM projects ORDER BY LOWER(label)
    `;

    const projectResults = await Promise.all(
      projects.map(async (project: { id: string; label: string }) => {
        const projectDb = getPgConnectionFromCacheOrNew(project.id, "READ_ONLY");
        const rawModules = await projectDb<DBModule[]>`
          SELECT id, dirty, installed_at, installed_git_ref, last_run_at, last_run_git_ref, config_selections
          FROM modules
        `;

        const modules: CompareProjectsModule[] = rawModules.map((raw) => {
          const config = parseModuleConfigSelections(raw.config_selections);
          const parameters = config.parameterDefinitions.map((def) => ({
            replacementString: def.replacementString,
            description: def.description,
            value: config.parameterSelections[def.replacementString] ?? "",
          }));

          return {
            id: raw.id,
            dirty: raw.dirty as CompareProjectsModule["dirty"],
            installedAt: raw.installed_at,
            installedGitRef: raw.installed_git_ref ?? undefined,
            lastRunAt: raw.last_run_at,
            lastRunGitRef: raw.last_run_git_ref ?? undefined,
            parameters,
          };
        });

        return {
          id: project.id,
          label: project.label,
          modules,
        };
      }),
    );

    const data: CompareProjectsData = { projects: projectResults };
    return c.json({ success: true, data });
  },
);
