// Operator backfill runner (PLAN_RESULTS_RUNS Status, model point 5):
// synthesizes an immutable run for every ready project — mint a runId, build
// runs/{runId} from the project's current sandbox CSVs + project-DB catalog +
// instance config, repoint projects.run_id. Per-project isolation: one
// failing project never blocks the others. Re-running repoints projects to
// fresh runs; superseded runs stay on disk (unreferenced) until run GC lands.
//
// Usage:
//   deno run --allow-all --env-file -c deno.json backfill_runs.ts \
//     [--project <projectId>]

import { getPgConnection } from "./server/db/postgres/connection_manager.ts";
import { synthesizeRunForProject } from "./server/runs/mod.ts";

const onlyProjectId = ((): string | undefined => {
  const i = Deno.args.indexOf("--project");
  return i >= 0 ? Deno.args[i + 1] : undefined;
})();

const mainDb = getPgConnection("main", { max: 2 });
const projects = await mainDb<{ id: string; label: string; status: string }[]>`
SELECT id, label, status FROM projects ORDER BY label
`;
let failures = 0;
for (const project of projects) {
  if (project.status !== "ready") continue;
  if (onlyProjectId && project.id !== onlyProjectId) continue;
  const projectDb = getPgConnection(project.id, { max: 2 });
  try {
    const { runId } = await synthesizeRunForProject(
      mainDb,
      projectDb,
      project.id,
      project.label,
    );
    console.log(`OK ${project.label} (${project.id}) -> run ${runId}`);
  } catch (e) {
    failures++;
    console.error(
      `FAILED ${project.label} (${project.id}): ${
        e instanceof Error ? e.message : e
      }`,
    );
  } finally {
    await projectDb.end();
  }
}
await mainDb.end();
Deno.exit(failures === 0 ? 0 : 1);
