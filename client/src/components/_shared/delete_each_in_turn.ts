import type { APIResponseNoData } from "lib";

// The bulk form of a delete whose guard is per item: the single route is
// called for each item in turn, a refusal is reported by label, and the rest
// still go. Nothing is refetched; each delete shrinks the listing over SSE.
export async function deleteEachInTurn<T>(
  items: T[],
  labelOf: (item: T) => string,
  deleteOne: (item: T) => Promise<APIResponseNoData>,
): Promise<APIResponseNoData> {
  const refused: string[] = [];
  for (const item of items) {
    const res = await deleteOne(item);
    if (!res.success) {
      refused.push(`${labelOf(item)}: ${res.err}`);
    }
  }
  return refused.length === 0
    ? { success: true }
    : { success: false, err: refused.join("; ") };
}
