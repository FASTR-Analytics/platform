import { Hono } from "hono";
import {
  type CompareProjectsData,
  type CompareProjectsModule,
} from "lib";
import { getPgConnectionFromCacheOrNew } from "../../db/postgres/mod.ts";
import { type DBModule } from "../../db/project/_project_database_types.ts";
import { parseModuleConfigSelections } from "../../db/project/modules.ts";
import { requireGlobalPermission } from "../../middleware/userPermission.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesInstanceModules = new Hono();

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
          SELECT id, dirty, compute_def_updated_at, compute_def_git_ref, presentation_def_updated_at, presentation_def_git_ref, last_run_at, last_run_git_ref, config_selections
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
            computeDefUpdatedAt: raw.compute_def_updated_at ?? undefined,
            computeDefGitRef: raw.compute_def_git_ref ?? undefined,
            presentationDefUpdatedAt: raw.presentation_def_updated_at ?? undefined,
            presentationDefGitRef: raw.presentation_def_git_ref ?? undefined,
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
