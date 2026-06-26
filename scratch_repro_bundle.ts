import postgres from "postgres";
import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
  figureBundleSchema,
  getFetchConfigFromPresentationObjectConfig,
  type PresentationObjectConfig,
  type ResultsValue,
} from "lib";
import { enrichMetric } from "./server/db/project/metric_enricher.ts";
import { getPresentationObjectItems } from "./server/server_only_funcs_presentation_objects/get_presentation_object_items.ts";

const PG_HOST = Deno.env.get("PG_HOST") ?? "localhost";
const PG_PORT = Number(Deno.env.get("PG_PORT") ?? "7001");
const PG_PASSWORD = Deno.env.get("PG_PASSWORD")!;

function conn(database: string) {
  return postgres({
    user: "postgres",
    hostname: PG_HOST,
    password: PG_PASSWORD,
    port: PG_PORT,
    database,
    max: 4,
    onnotice: () => {},
    transform: { undefined: null },
  });
}

const mainDb = conn("main");

const projectDbIds: string[] = (
  await mainDb<{ datname: string }[]>`
    SELECT datname FROM pg_database WHERE datname ~ '^[0-9a-f]{8}-'
  `
).map((r) => r.datname);

const localization = { language: "en" as const, calendar: "gregorian" as const, countryIso3: "" };

let totalParsed = 0;
let totalFailed = 0;
const failureSummary = new Map<string, number>();

for (const projectId of projectDbIds) {
  const projectDb = conn(projectId);
  let metricRows: any[];
  try {
    metricRows = await projectDb`SELECT * FROM metrics`;
  } catch {
    await projectDb.end();
    continue;
  }
  if (metricRows.length === 0) {
    await projectDb.end();
    continue;
  }

  for (const m of metricRows) {
    let rv: ResultsValue;
    try {
      rv = await enrichMetric(m as any, projectDb);
    } catch (e) {
      console.log(`[${projectId}] metric ${m.id} enrichMetric FAILED: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const presets = m.viz_presets ? JSON.parse(m.viz_presets) : [];
    if (presets.length === 0) continue;

    for (const preset of presets) {
      const config: PresentationObjectConfig = {
        d: { ...preset.config.d },
        s: { ...DEFAULT_S_CONFIG, ...preset.config.s },
        t: { ...DEFAULT_T_CONFIG, caption: "test" },
      };

      let fetchConfig;
      try {
        const r = getFetchConfigFromPresentationObjectConfig(rv, config);
        if (!r.success) {
          continue;
        }
        fetchConfig = r.data;
      } catch {
        continue;
      }

      let itemsRes;
      try {
        itemsRes = await getPresentationObjectItems(
          mainDb,
          projectId,
          projectDb,
          rv.resultsObjectId,
          fetchConfig,
          rv.mostGranularTimePeriodColumnInResultsFile,
          "",
          "v1",
        );
      } catch (e) {
        continue;
      }
      if (!itemsRes.success) continue;
      const ih: any = itemsRes.data;
      if (ih.status !== "ok") continue;

      const bundle = {
        config,
        items: ih.items,
        resultsValue: {
          formatAs: rv.formatAs,
          valueProps: rv.valueProps,
          valueLabelReplacements: rv.valueLabelReplacements ?? undefined,
        },
        indicatorMetadata: ih.indicatorMetadata,
        dateRange: ih.dateRange,
        geo: undefined,
        localization,
        metricId: rv.id,
        snapshotAt: "2026-06-26T00:00:00.000Z",
        provenance: { moduleLastRun: "", datasetsVersion: ih.datasetsVersion ?? "v1" },
      };

      const parsed = figureBundleSchema.safeParse(bundle);
      if (parsed.success) {
        totalParsed++;
      } else {
        totalFailed++;
        for (const issue of parsed.error.issues) {
          const key = `${issue.path.slice(0, 3).join(".")} :: ${issue.code} :: ${issue.message}`;
          failureSummary.set(key, (failureSummary.get(key) ?? 0) + 1);
        }
        if (totalFailed <= 12) {
          console.log(`\n[FAIL] project=${projectId} metric=${rv.id} preset=${preset.id}`);
          for (const issue of parsed.error.issues.slice(0, 4)) {
            console.log(`   path=${issue.path.join(".")} code=${issue.code} msg=${issue.message}`);
            // print the offending value
            let v: any = bundle;
            for (const p of issue.path) v = v?.[p as any];
            console.log(`   value=${JSON.stringify(v)?.slice(0, 200)}`);
          }
        }
      }
    }
  }
  await projectDb.end();
}

console.log(`\n\n=== SUMMARY ===`);
console.log(`parsed OK: ${totalParsed}`);
console.log(`failed:    ${totalFailed}`);
console.log(`\nfailure buckets:`);
for (const [k, n] of [...failureSummary.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n}x  ${k}`);
}

await mainDb.end();
