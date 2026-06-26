import postgres from "postgres";
import { indicatorMetadataSchema } from "lib";
import { getIndicatorMetadata } from "./server/server_only_funcs_presentation_objects/get_indicator_metadata.ts";

const PG_PASSWORD = Deno.env.get("PG_PASSWORD")!;
function conn(database: string) {
  return postgres({
    user: "postgres", hostname: "localhost", password: PG_PASSWORD, port: 7001,
    database, max: 4, onnotice: () => {}, transform: { undefined: null },
  });
}
const mainDb = conn("main");
const dbs: string[] = (await mainDb<{ datname: string }[]>`
  SELECT datname FROM pg_database WHERE datname ~ '^[0-9a-f]{8}-'`).map((r) => r.datname);

let ok = 0, fail = 0;
const buckets = new Map<string, number>();
for (const projectId of dbs) {
  const projectDb = conn(projectId);
  let modules: { id: string }[];
  try { modules = await projectDb<{ id: string }[]>`SELECT id FROM modules`; }
  catch { await projectDb.end(); continue; }
  for (const mod of modules) {
    let meta;
    try { meta = await getIndicatorMetadata(mainDb, projectDb, mod.id); }
    catch (e) { console.log(`[${projectId}] module ${mod.id} getIndicatorMetadata THREW: ${e instanceof Error ? e.message : e}`); continue; }
    for (const m of meta) {
      const r = indicatorMetadataSchema.safeParse(m);
      if (r.success) { ok++; } else {
        fail++;
        for (const iss of r.error.issues) {
          buckets.set(`${iss.path.join(".")} :: ${iss.message}`, (buckets.get(`${iss.path.join(".")} :: ${iss.message}`) ?? 0) + 1);
        }
        if (fail <= 15) console.log(`[FAIL ${projectId}/${mod.id}] ${JSON.stringify(m)} -> ${r.error.issues.map(i=>i.path.join(".")+":"+i.message).join("; ")}`);
      }
    }
  }
  await projectDb.end();
}
console.log(`\n=== indicatorMetadata: ok=${ok} fail=${fail} ===`);
for (const [k, n] of [...buckets].sort((a,b)=>b[1]-a[1])) console.log(`  ${n}x  ${k}`);
await mainDb.end();
