import { Hono } from "hono";
import {
  type CompareProjectsData,
  type CompareProjectsModule,
} from "lib";
import { parseModuleConfigSelections } from "../../db/project/modules.ts";
import { getRunManifestCached } from "../../runs/mod.ts";
import { requireGlobalPermission } from "../../middleware/userPermission.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesInstanceModules = new Hono();

// Cross-project module comparison, read from each project's ATTACHED results
// package (PLAN_RESULTS_RUNS Phase 3 re-cut ruling 5): the project catalog
// tables are no longer written by generation, so reading them here would
// report a frozen pre-cutover picture. A project with no package (or an
// unreadable one) simply contributes no modules.
defineRoute(
  routesInstanceModules,
  "compareProjects",
  requireGlobalPermission({ requireAdmin: true }),
  async (c) => {
    const projects: { id: string; label: string; run_id: string | null }[] =
      await c.var.mainDb`
      SELECT id, label, run_id FROM projects ORDER BY LOWER(label)
    `;

    const projectResults = await Promise.all(
      projects.map(async (project) => {
        const modules: CompareProjectsModule[] = [];
        if (project.run_id !== null) {
          try {
            const manifest = await getRunManifestCached(project.run_id);
            for (const mod of manifest.modules) {
              const config = parseModuleConfigSelections(
                mod.configSelections ?? "{}",
              );
              modules.push({
                id: mod.id,
                lastRunAt: mod.lastRunAt ?? "",
                lastRunGitRef: mod.lastRunGitRef ?? undefined,
                parameters: config.parameterDefinitions.map((def) => ({
                  replacementString: def.replacementString,
                  description: def.description,
                  value: config.parameterSelections[def.replacementString] ?? "",
                })),
              });
            }
          } catch (e) {
            console.error(
              `[runs] compareProjects: run ${project.run_id} unreadable for project ${project.id}: ${
                e instanceof Error ? e.message : e
              }`,
            );
          }
        }
        return { id: project.id, label: project.label, modules };
      }),
    );

    const data: CompareProjectsData = { projects: projectResults };
    return c.json({ success: true, data });
  },
);
