import postgres from "postgres";
import { indicatorMetadataSchema, resultsValueForVisualizationSchema } from "lib";
import { getIndicatorMetadata } from "./server/server_only_funcs_presentation_objects/get_indicator_metadata.ts";

// Args: host port password instanceLabel
const [host, portStr, password, label] = Deno.args;
const port = Number(portStr);

function conn(database: string) {
  return postgres({
    user: "postgres", hostname: host, password, port,
    database, max: 4, onnotice: () => {}, connect_timeout: 15,
    transform: { undefined: null },
  });
}

const mainDb = conn("main");

let projects: { id: string }[];
try {
  projects = await mainDb<{ id: string }[]>`
    SELECT id FROM projects WHERE status <> 'pending_deletion'`;
} catch (e) {
  console.log(`[${label}] main query failed: ${e instanceof Error ? e.message : e}`);
  await mainDb.end();
  Deno.exit(0);
}

let metaOk = 0, metaFail = 0, vlrFail = 0;
const buckets = new Map<string, number>();

for (const proj of projects) {
  const projectDb = conn(proj.id);
  // current schema only
  let hasMetrics = false;
  try {
    const r = await projectDb<{ x: string | null }[]>`SELECT to_regclass('public.metrics')::text as x`;
    hasMetrics = r[0]?.x === "metrics";
  } catch { await projectDb.end(); continue; }
  if (!hasMetrics) { await projectDb.end(); continue; }

  // indicatorMetadata sweep
  let modules: { id: string }[] = [];
  try { modules = await projectDb<{ id: string }[]>`SELECT id FROM modules`; } catch {}
  for (const mod of modules) {
    let meta;
    try { meta = await getIndicatorMetadata(mainDb, projectDb, mod.id); }
    catch { continue; }
    for (const m of meta) {
      const r = indicatorMetadataSchema.safeParse(m);
      if (r.success) metaOk++;
      else {
        metaFail++;
        for (const iss of r.error.issues) {
          const k = `indMeta.${iss.path.join(".")} :: ${iss.message}`;
          buckets.set(k, (buckets.get(k) ?? 0) + 1);
        }
        if (metaFail <= 8) console.log(`[${label}/${proj.id}/${mod.id}] indMeta FAIL ${JSON.stringify(m)}`);
      }
    }
  }

  // VLR sweep — validate the resultsValue projection as built on the from_metric path
  let metricRows: { id: string; format_as: string; value_props: string; value_label_replacements: string | null }[] = [];
  try {
    metricRows = await projectDb`SELECT id, format_as, value_props, value_label_replacements FROM metrics`;
  } catch {}
  for (const m of metricRows) {
    let vlr: unknown = undefined;
    if (m.value_label_replacements) {
      try { vlr = JSON.parse(m.value_label_replacements); } catch { vlr = "PARSE_ERROR"; }
    }
    const rvProj = {
      formatAs: m.format_as,
      valueProps: (() => { try { return JSON.parse(m.value_props); } catch { return []; } })(),
      valueLabelReplacements: vlr ?? undefined,
    };
    const r = resultsValueForVisualizationSchema.safeParse(rvProj);
    if (!r.success) {
      vlrFail++;
      for (const iss of r.error.issues) {
        const k = `resultsValue.${iss.path.join(".")} :: ${iss.message}`;
        buckets.set(k, (buckets.get(k) ?? 0) + 1);
      }
      if (vlrFail <= 8) console.log(`[${label}/${proj.id}/${m.id}] VLR FAIL ${JSON.stringify(rvProj).slice(0,200)}`);
    }
  }

  await projectDb.end();
}

console.log(`[${label}] projects=${projects.length} indMeta(ok=${metaOk} fail=${metaFail}) vlrFail=${vlrFail}`);
for (const [k, n] of [...buckets].sort((a,b)=>b[1]-a[1])) console.log(`   ${n}x ${k}`);
await mainDb.end();
