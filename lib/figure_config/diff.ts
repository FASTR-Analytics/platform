import type { FigureConfig } from "./schema.ts";

export type FigureConfigChange = {
  path: string;
  before: unknown;
  after: unknown;
};

// Every field where two configs differ, by its path ("style.decimalPlaces",
// "data.filters[0].values"). A list of plain values is one field; a list of
// objects of one length is compared item by item, and of two lengths is one
// field. A field present in one config only is a change from or to undefined.
export function diffFigureConfigs(
  before: FigureConfig,
  after: FigureConfig,
): FigureConfigChange[] {
  const out: FigureConfigChange[] = [];
  walk("", before, after, out);
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function walk(
  path: string,
  a: unknown,
  b: unknown,
  out: FigureConfigChange[],
): void {
  if (isRecord(a) && isRecord(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of keys) {
      walk(path === "" ? k : `${path}.${k}`, a[k], b[k], out);
    }
    return;
  }
  if (
    Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
    [...a, ...b].some(isRecord)
  ) {
    a.forEach((item, i) => walk(`${path}[${i}]`, item, b[i], out));
    return;
  }
  if (!same(a, b)) out.push({ path, before: a, after: b });
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => same(x, b[i]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => same(a[k], b[k]));
  }
  return false;
}
