import { del, get, keys, set } from "idb-keyval";
import type { GeoJSONFeatureCollection } from "panther";
import {
  type FacilityFamily,
  type RunGeoJsonMap,
  type RunGeoJsonStamp,
  tryCatchServerRaw,
} from "lib";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { getSnapshotInstanceState } from "./t1_store";
import { preloadGeoJson } from "./t2_geojson";

// The boundaries a results package was generated with, keyed by run. A ready
// run directory never changes, so a stamp and a file are immutable once read,
// in memory and in IDB (as the authoring context is, t2_run_authoring_context):
// nothing invalidates an entry; eviction drops a run once it is no longer
// ready. Its own IDB prefix, because evictDeletedGeoJsonLevels deletes every
// `geojson:` key it does not list.
const IDB_PREFIX = "run_geojson:";

const stampKey = (runId: string) => `${IDB_PREFIX}${runId}:stamp`;
const dataKey = (runId: string, family: FacilityFamily, level: number) =>
  `${IDB_PREFIX}${runId}:${family}:${level}`;

const stamps = new Map<string, RunGeoJsonStamp>();
const data = new Map<string, GeoJSONFeatureCollection>();
const stampsInFlight = new Map<string, Promise<void>>();
const dataInFlight = new Map<string, Promise<void>>();

// Bumped when a stamp or a file lands, and read by every tracked read, so a
// figure built before its boundaries arrived rebuilds once they do.
const [version, setVersion] = createSignal(0);

// What a figure resolving against its own package can draw:
// - ready: the package's boundaries, in hand.
// - loading: the stamp, or the listed file, has not arrived.
// - not_in_package: the package was generated without this level.
// - run_unknown: the package predates the capture, or the run is gone; the
//   caller reads the instance's boundaries instead.
export type RunGeoJsonRead =
  | { state: "ready"; data: GeoJSONFeatureCollection }
  | { state: "loading" }
  | { state: "not_in_package" }
  | { state: "run_unknown" };

export function getRunGeoJsonSync(
  runId: string,
  family: FacilityFamily,
  level: number,
): RunGeoJsonRead {
  version();
  return readRunGeoJson(runId, family, level, true);
}

// The stamp's map list, tracked: undefined while the stamp has not arrived,
// null for a package that carries no capture or a run that is gone.
export function getRunGeoJsonMapsSync(
  runId: string,
): RunGeoJsonMap[] | null | undefined {
  version();
  const stamp = stamps.get(runId);
  if (stamp === undefined) {
    void loadStamp(runId);
    return undefined;
  }
  return stamp.found ? stamp.geojsonMaps : null;
}

// Resolves once the stamp is held or its read has failed; never rejects, so a
// caller can await it without a catch.
export async function ensureRunGeoJsonStamp(runId: string): Promise<void> {
  await loadStamp(runId);
}

// For a caller that builds after an await, where a sync read tracks nothing:
// resolves once the read answers anything but loading, or its fetch has
// failed. On run_unknown the instance's file for the level is loaded too, so
// the fallback the resolver takes is in hand.
export async function ensureRunGeoJson(
  runId: string,
  family: FacilityFamily,
  level: number,
): Promise<RunGeoJsonRead> {
  await loadStamp(runId);
  let read = readRunGeoJson(runId, family, level, false);
  if (read.state === "loading") {
    await loadData(runId, family, level);
    read = readRunGeoJson(runId, family, level, false);
  }
  if (read.state === "run_unknown") {
    const map = getSnapshotInstanceState().geojsonMaps.find((m) =>
      m.family === family && m.adminAreaLevel === level
    );
    if (map !== undefined) await preloadGeoJson([map]);
  }
  return read;
}

function readRunGeoJson(
  runId: string,
  family: FacilityFamily,
  level: number,
  startFetches: boolean,
): RunGeoJsonRead {
  const stamp = stamps.get(runId);
  if (stamp === undefined) {
    if (startFetches) void loadStamp(runId);
    return { state: "loading" };
  }
  if (!stamp.found || stamp.geojsonMaps === null) {
    return { state: "run_unknown" };
  }
  if (
    !stamp.geojsonMaps.some((m) =>
      m.family === family && m.adminAreaLevel === level
    )
  ) {
    return { state: "not_in_package" };
  }
  const held = data.get(dataKey(runId, family, level));
  if (held !== undefined) return { state: "ready", data: held };
  if (startFetches) void loadData(runId, family, level);
  return { state: "loading" };
}

// A failed request is neither held nor cached, and bumps nothing: the next
// read asks again, so a transient failure never settles a run as unknown.
function loadStamp(runId: string): Promise<void> {
  if (stamps.has(runId)) return Promise.resolve();
  return dedupe(stampsInFlight, runId, async () => {
    const stored = await idbGet<RunGeoJsonStamp>(stampKey(runId));
    if (stored !== undefined) {
      stamps.set(runId, stored);
      setVersion((v) => v + 1);
      return;
    }
    const res = await serverActions.getRunGeoJsonStamp({ run_id: runId });
    if (!res.success) return;
    stamps.set(runId, res.data);
    setVersion((v) => v + 1);
    // A run that is gone is held for this session only: eviction owns
    // forgetting it, and IDB keeps only what a ready run carries.
    if (res.data.found) await idbSet(stampKey(runId), res.data);
  });
}

function loadData(
  runId: string,
  family: FacilityFamily,
  level: number,
): Promise<void> {
  const key = dataKey(runId, family, level);
  if (data.has(key)) return Promise.resolve();
  return dedupe(dataInFlight, key, async () => {
    const stored = await idbGet<GeoJSONFeatureCollection>(key);
    if (stored !== undefined) {
      data.set(key, stored);
      setVersion((v) => v + 1);
      return;
    }
    const res = await tryCatchServerRaw(
      `/run_generation/run/${runId}/geojson/${family}/${level}`,
      async (r) => (await r.json()) as GeoJSONFeatureCollection,
    );
    if (!res.success) return;
    data.set(key, res.data);
    setVersion((v) => v + 1);
    await idbSet(key, res.data);
  });
}

function dedupe(
  inFlight: Map<string, Promise<void>>,
  key: string,
  load: () => Promise<void>,
): Promise<void> {
  const pending = inFlight.get(key);
  if (pending !== undefined) return pending;
  const promise = load()
    .catch((e) => console.error(`run geojson ${key}:`, e))
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    return await get<T>(key);
  } catch {
    return undefined;
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    await set(key, value);
  } catch (e) {
    console.error(`run geojson ${key}: IDB write failed:`, e);
  }
}

// Drops every run that is no longer ready, memory and IDB together. A run
// that backs no product but is still ready keeps its entry: a stale figure or
// an open explore view may still read it.
export async function evictRunGeoJsonNotIn(
  readyRunIds: readonly string[],
): Promise<void> {
  const keep = new Set(readyRunIds);
  const runOf = (key: string) => key.split(":")[0];
  let removedAny = false;
  for (const runId of [...stamps.keys()]) {
    if (!keep.has(runId)) {
      stamps.delete(runId);
      removedAny = true;
    }
  }
  for (const key of [...data.keys()]) {
    if (!keep.has(runOf(key))) {
      data.delete(key);
      removedAny = true;
    }
  }
  if (removedAny) setVersion((v) => v + 1);
  try {
    for (const key of await keys()) {
      if (
        typeof key === "string" && key.startsWith(IDB_PREFIX) &&
        !keep.has(runOf(key.slice(IDB_PREFIX.length)))
      ) {
        await del(key);
      }
    }
  } catch (e) {
    console.error("evictRunGeoJsonNotIn: IDB cleanup failed:", e);
  }
}

export function clearRunGeoJsonMemoryCache(): void {
  stamps.clear();
  data.clear();
  setVersion((v) => v + 1);
}
