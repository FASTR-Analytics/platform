// Every metric that must read `formatAs: "indicator"` — the metrics whose
// values ARE the displayed indicator's own quantity. Most predate the three-way
// `formatAs` and have stored data to repair; m10-03-01/02 were authored
// "indicator" from day one and are here defensively, for the normalization job
// only. Frozen: it never grows — a metric authored now says "indicator" itself,
// so nothing new can ever belong here.
//
// It has two distinct jobs, and both need the same list:
//
//   - REPAIR of data written before the declaration existed: project migration
//     039 (metrics table, SQL literal — the one copy that cannot import this),
//     manifest_transform block 2 (run manifests), and the figure-block sweep
//     (stored bundles).
//   - NORMALIZATION of definitions arriving now, in validateDefinition
//     (server/module_loader/load_module.ts). A definition resolved at an older
//     gitRef — or at HEAD before the modules repo is pushed — still declares
//     the old two-way value, and it would be stamped into a manifest already
//     carrying the current schema version, which no migration can then reach.
//     Normalizing at the fetch boundary means no definition version can put a
//     stale declaration into the app.
export const INDICATOR_FORMAT_METRIC_IDS: readonly string[] = [
  "m7-01-01",
  "m7-01-02",
  "m7-01-03",
  "m8-01-01",
  "m10-01-01",
  "m10-01-02",
  "m10-03-01",
  "m10-03-02",
];
