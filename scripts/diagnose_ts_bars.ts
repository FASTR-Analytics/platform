// Diagnose timeseries-bar figure drift in stored slides.
// Usage:
//   PG_HOST=... PG_PORT=... PG_PASSWORD=... \
//   deno run -A scripts/diagnose_ts_bars.ts <project-db-name> [slideId...]
//
// Prints, for each transformed timeseries figure: header shape, dimension
// counts, values-array dims, per-tier data presence, and the scale limits the
// renderer would read. This tells us exactly why bars overflow.

import postgres from "postgres";

const db = Deno.args[0];
if (!db) {
  console.error("Pass the project DB name as the first arg.");
  Deno.exit(1);
}
const onlySlides = new Set(Deno.args.slice(1));

const sql = postgres({
  host: Deno.env.get("PG_HOST") ?? "localhost",
  port: Number(Deno.env.get("PG_PORT") ?? "5432"),
  user: Deno.env.get("PG_USER") ?? "postgres",
  password: Deno.env.get("PG_PASSWORD") ?? "",
  database: db,
});

function dims(v: unknown): number[] {
  const out: number[] = [];
  let cur: unknown = v;
  while (Array.isArray(cur)) {
    out.push(cur.length);
    cur = cur[0];
  }
  return out;
}

// Count how many (tier) slices contain at least one defined value.
function tierDataPresence(values: unknown): (number | null)[] {
  if (!Array.isArray(values) || !Array.isArray(values[0])) return [];
  const nTiers = (values[0] as unknown[]).length;
  const counts: (number | null)[] = [];
  for (let t = 0; t < nTiers; t++) {
    let n = 0;
    for (const pane of values as unknown[][]) {
      const tier = pane[t];
      const stack = JSON.stringify(tier);
      n += (stack.match(/-?\d+(\.\d+)?/g) ?? []).length;
    }
    counts.push(n);
  }
  return counts;
}

function report(slideId: string, d: Record<string, unknown>) {
  const tierH = d.tierHeaders as unknown[] | undefined;
  const sal = d.scaleAxisLimits as
    | { paneLimits?: { tierLimits?: unknown; laneLimits?: unknown }[] }
    | undefined;
  console.log("─".repeat(70));
  console.log(`slide=${slideId}`);
  console.log({
    isTransformed: d.isTransformed,
    headersAreStrings: typeof tierH?.[0] === "string",
    tierHeaders: tierH,
    paneLen: (d.paneHeaders as unknown[])?.length,
    laneLen: (d.laneHeaders as unknown[])?.length,
    seriesLen: (d.seriesHeaders as unknown[])?.length,
    valuesDims: dims(d.values), // [pane, tier, lane, series, lastDim]
    tierDataPresence: tierDataPresence(d.values), // count of numbers per tier
    hasScaleAxisLimits: !!sal,
    hasYScaleAxisData: !!d.yScaleAxisData,
  });
  console.log(
    "pane[0].tierLimits:",
    JSON.stringify(sal?.paneLimits?.[0]?.tierLimits),
  );
  console.log(
    "pane[0].laneLimits:",
    JSON.stringify(sal?.paneLimits?.[0]?.laneLimits),
  );
}

function walk(n: any, slideId: string) {
  if (n?.type === "item" && n.data?.type === "figure" && n.data.figureInputs) {
    const fi = n.data.figureInputs;
    for (const key of ["timeseriesData", "chartData", "chartOHData"]) {
      const d = fi[key];
      if (d?.isTransformed) {
        console.log(`(${key})`);
        report(slideId, d);
      }
    }
  }
  if (Array.isArray(n?.children)) for (const c of n.children) walk(c, slideId);
}

const rows = await sql<{ id: string; config: string }[]>`
  SELECT id, config FROM slides
`;
for (const r of rows) {
  if (onlySlides.size && !onlySlides.has(r.id)) continue;
  const c = JSON.parse(r.config);
  if (c.type !== "content" || !c.layout) continue;
  walk(c.layout, r.id);
}

await sql.end();
