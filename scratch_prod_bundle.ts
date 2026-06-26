import postgres from "postgres";
import {
  DEFAULT_S_CONFIG, DEFAULT_T_CONFIG, figureBundleSchema,
  getFetchConfigFromPresentationObjectConfig,
  type PresentationObjectConfig, type ResultsValue,
} from "lib";
import { enrichMetric } from "./server/db/project/metric_enricher.ts";
import { getPresentationObjectItems } from "./server/server_only_funcs_presentation_objects/get_presentation_object_items.ts";

const [host, portStr, password, label] = Deno.args;
const port = Number(portStr);
function conn(database: string) {
  return postgres({ user: "postgres", hostname: host, password, port, database, max: 2, onnotice: () => {}, connect_timeout: 15, statement_timeout: 8000, transform: { undefined: null } });
}
const mainDb = conn("main");
const localization = { language: "en" as const, calendar: "gregorian" as const, countryIso3: "" };

let projects: { id: string }[] = [];
try { projects = await mainDb<{ id: string }[]>`SELECT id FROM projects WHERE status <> 'pending_deletion'`; }
catch (e) { console.log(`[${label}] main fail ${e}`); await mainDb.end(); Deno.exit(0); }

let ok = 0, fail = 0, skipNoItems = 0;
const buckets = new Map<string, number>();

for (const proj of projects) {
  const projectDb = conn(proj.id);
  let metricRows: any[] = [];
  try {
    const has = (await projectDb<{ x: string | null }[]>`SELECT to_regclass('public.metrics')::text as x`)[0]?.x === "metrics";
    if (!has) { await projectDb.end(); continue; }
    metricRows = await projectDb`SELECT * FROM metrics`;
  } catch { await projectDb.end(); continue; }

  for (const m of metricRows) {
    let rv: ResultsValue;
    try { rv = await enrichMetric(m as any, projectDb); } catch { continue; }
    const presets = (m.viz_presets ? JSON.parse(m.viz_presets) : []).slice(0, 1);
    for (const preset of presets) {
      let config: PresentationObjectConfig;
      try {
        config = { d: { ...preset.config.d }, s: { ...DEFAULT_S_CONFIG, ...preset.config.s }, t: { ...DEFAULT_T_CONFIG, caption: "t" } };
      } catch { continue; }
      let fc;
      try { const r = getFetchConfigFromPresentationObjectConfig(rv, config); if (!r.success) continue; fc = r.data; } catch { continue; }
      let itemsRes;
      try {
        itemsRes = await getPresentationObjectItems(mainDb, proj.id, projectDb, rv.resultsObjectId, fc, rv.mostGranularTimePeriodColumnInResultsFile, "", "v1");
      } catch { continue; }
      if (!itemsRes.success) continue;
      const ih: any = itemsRes.data;
      if (ih.status !== "ok") { skipNoItems++; continue; }
      const bundle = {
        config, items: ih.items,
        resultsValue: { formatAs: rv.formatAs, valueProps: rv.valueProps, valueLabelReplacements: rv.valueLabelReplacements ?? undefined },
        indicatorMetadata: ih.indicatorMetadata, dateRange: ih.dateRange, geo: undefined, localization,
        metricId: rv.id, snapshotAt: "2026-06-26T00:00:00.000Z",
        provenance: { moduleLastRun: "", datasetsVersion: ih.datasetsVersion ?? "v1" },
      };
      const parsed = figureBundleSchema.safeParse(bundle);
      if (parsed.success) ok++;
      else {
        fail++;
        for (const iss of parsed.error.issues) {
          const k = `${iss.path.slice(0,2).join(".")} :: ${iss.message}`;
          buckets.set(k, (buckets.get(k) ?? 0) + 1);
        }
        if (fail <= 10) {
          let v: any = bundle; const p0 = parsed.error.issues[0].path; for (const p of p0) v = v?.[p];
          console.log(`[${label}/${proj.id}/${rv.id}/${preset.id}] FAIL ${p0.join(".")} :: ${parsed.error.issues[0].message} :: val=${JSON.stringify(v)?.slice(0,150)}`);
        }
      }
    }
  }
  await projectDb.end();
}
console.log(`[${label}] bundleParse ok=${ok} fail=${fail} skipNoItems=${skipNoItems}`);
for (const [k, n] of [...buckets].sort((a,b)=>b[1]-a[1])) console.log(`   ${n}x ${k}`);
await mainDb.end();
