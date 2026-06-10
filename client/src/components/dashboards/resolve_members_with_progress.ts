import { FigureBlock } from "lib";

// Resolve one figure per replicant, reporting progress (0..1) and collecting the
// shared geojson once (group members store geo_data on the group, not the row).
// Shared by the add flow and the edit-time reshape. `resolveOne` throws on
// failure → this propagates it to the caller.
export async function resolveMembersWithProgress(
  replicants: { value: string; label: string }[],
  resolveOne: (
    replicantValue: string,
  ) => Promise<{ figureBlock: FigureBlock; geoData?: unknown }>,
  onProgress: (frac: number, msg: string) => void,
): Promise<{
  members: { replicantValue: string; label: string; figureBlock: FigureBlock }[];
  sharedGeoData: unknown;
}> {
  const members: {
    replicantValue: string;
    label: string;
    figureBlock: FigureBlock;
  }[] = [];
  let sharedGeoData: unknown = undefined;
  for (let i = 0; i < replicants.length; i++) {
    const { value, label } = replicants[i];
    onProgress(
      (i / replicants.length) * 0.9,
      `Resolving ${i + 1} of ${replicants.length}...`,
    );
    let resolved: { figureBlock: FigureBlock; geoData?: unknown };
    try {
      resolved = await resolveOne(value);
    } catch (err) {
      throw new Error(
        `Failed resolving replicant ${i + 1} (${label}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    members.push({ replicantValue: value, label, figureBlock: resolved.figureBlock });
    if (sharedGeoData === undefined && resolved.geoData !== undefined) {
      sharedGeoData = resolved.geoData;
    }
  }
  return { members, sharedGeoData };
}
