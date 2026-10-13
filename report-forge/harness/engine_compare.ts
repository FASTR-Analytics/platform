// Compares two engine snapshots (engine_snapshot.ts). Exits 1 on any
// difference, naming each entry that moved and the first place it differs.
//
//   deno run -A report-forge/harness/engine_compare.ts <a.json> <b.json>

const [aPath, bPath] = Deno.args;
if (!aPath || !bPath) {
  console.error("usage: engine_compare.ts <a.json> <b.json>");
  Deno.exit(2);
}

const a = JSON.parse(await Deno.readTextFile(aPath)) as Record<string, unknown>;
const b = JSON.parse(await Deno.readTextFile(bPath)) as Record<string, unknown>;

const text = (v: unknown) => typeof v === "string" ? v : JSON.stringify(v);

let different = 0;
for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
  if (!(key in a)) {
    console.log(`+ ${key} (only in ${bPath})`);
    different++;
    continue;
  }
  if (!(key in b)) {
    console.log(`- ${key} (only in ${aPath})`);
    different++;
    continue;
  }
  const x = text(a[key]);
  const y = text(b[key]);
  if (x === y) continue;
  different++;
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  const from = Math.max(0, i - 40);
  console.log(`! ${key} differs at ${i}`);
  console.log(`    a: ${JSON.stringify(x.slice(from, i + 60))}`);
  console.log(`    b: ${JSON.stringify(y.slice(from, i + 60))}`);
}

const total = new Set([...Object.keys(a), ...Object.keys(b)]).size;
if (different === 0) {
  console.log(`OK: ${total} entries identical`);
} else {
  console.log(`${different} of ${total} entries differ`);
  Deno.exit(1);
}
