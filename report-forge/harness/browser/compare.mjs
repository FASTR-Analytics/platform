// Browser parity, step 2: compare two runs of shots.mjs.
//
//   node harness/browser/compare.mjs <a> <b>
//
// Each side is a directory shots.mjs wrote, or a metrics.json on its own (the
// committed baseline is one: harness/baseline/browser_metrics.json). Numbers
// are compared exactly. Screenshots are compared pixel by pixel when both
// sides have them; without them only the numbers are checked, which is what a
// run on another machine can be held to (text rasterises differently, the
// layout does not).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(
  path.resolve(here, "..", "..", "playground", "package.json"),
);
const { PNG } = require("pngjs");

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error("usage: compare.mjs <dirOrMetricsJson> <dirOrMetricsJson>");
  process.exit(2);
}
const isDir = (p) => fs.statSync(p).isDirectory();
const metricsOf = (p) =>
  JSON.parse(fs.readFileSync(isDir(p) ? path.join(p, "metrics.json") : p));
const shotOf = (p, name) => {
  if (!isDir(p)) return undefined;
  const file = path.join(p, `${name}.png`);
  return fs.existsSync(file) ? PNG.sync.read(fs.readFileSync(file)) : undefined;
};

const ma = metricsOf(a);
const mb = metricsOf(b);
let bad = 0;
for (const name of Object.keys(ma)) {
  if (!mb[name]) {
    console.log(`MISS ${name}: not in ${b}`);
    bad++;
    continue;
  }
  const differing = Object.keys(ma[name].metrics).filter((k) =>
    JSON.stringify(ma[name].metrics[k]) !== JSON.stringify(mb[name].metrics[k])
  );
  const pa = shotOf(a, name);
  const pb = shotOf(b, name);
  let pixels = "not compared";
  let pixelDiff = 0;
  if (pa && pb) {
    if (pa.width !== pb.width || pa.height !== pb.height) {
      pixelDiff = -1;
    } else {
      for (let i = 0; i < pa.data.length; i += 4) {
        const d = Math.abs(pa.data[i] - pb.data[i]) +
          Math.abs(pa.data[i + 1] - pb.data[i + 1]) +
          Math.abs(pa.data[i + 2] - pb.data[i + 2]);
        if (d > 6) pixelDiff++;
      }
    }
    pixels = String(pixelDiff);
  }
  const ok = differing.length === 0 && pixelDiff === 0;
  if (!ok) bad++;
  console.log(
    `${ok ? "OK  " : "DIFF"} ${name}: pixels=${pixels} metrics=${
      differing.join(",") || "same"
    }`,
  );
  for (const k of differing) {
    console.log(`     ${k}`);
    console.log(
      `       a: ${JSON.stringify(ma[name].metrics[k]).slice(0, 300)}`,
    );
    console.log(
      `       b: ${JSON.stringify(mb[name].metrics[k]).slice(0, 300)}`,
    );
  }
}
console.log(
  bad === 0
    ? `OK: ${Object.keys(ma).length} scenarios match`
    : `${bad} scenario(s) differ`,
);
process.exit(bad ? 1 : 0);
