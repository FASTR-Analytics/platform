// Builds/refreshes the Deploy-1 results package for every ready project — the
// same finalize the server runs at boot (for projects without a manifest) and
// at every project-level act. Idempotent full rewrite per project; use it to
// prepare an instance for the parity rig's --package mode or to force-refresh
// after a code change to the finalize logic.
//
// Usage:
//   deno run --allow-all --env-file -c deno.json build_results_packages.ts \
//     [--project <projectId>]

import { getPgConnection } from "./server/db/postgres/connection_manager.ts";
import { refreshSandboxPackage } from "./server/runs/mod.ts";

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
    await refreshSandboxPackage(mainDb, projectDb, project.id);
    console.log(`OK ${project.label} (${project.id})`);
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
