import type { PresentationObjectConfig, ResultsValue } from "lib";
import { getFetchConfigFromPresentationObjectConfig, getReplicateByProp } from "lib";
import { getReplicantOptionsFromCacheOrFetch } from "~/state/project/t2_replicant_options";

// Strict replicant validation, shared by every path where the AI CREATES or EDITS
// a figure (from_metric, from_visualization, update_figure). Throws with the
// valid-value list when a figure has an active replicant but no — or an invalid —
// selectedReplicantValue, so the AI gets a clear error instead of a silent
// auto-default.
//
// The non-AI / interactive render paths deliberately do NOT call this: they
// auto-default via resolveDefaultReplicant so a figure always shows something for
// a human who is clicking around.
export async function assertReplicantValid(
  projectId: string,
  resultsValue: ResultsValue,
  config: PresentationObjectConfig,
): Promise<void> {
  const replicateBy = getReplicateByProp(config);
  if (!replicateBy) return;

  // Options query needs the auto-pin EXCLUDED so it returns all in-scope values.
  const resOptions = getFetchConfigFromPresentationObjectConfig(resultsValue, config, {
    excludeReplicantFilter: true,
  });
  if (!resOptions.success) {
    throw new Error(resOptions.err);
  }
  const optRes = await getReplicantOptionsFromCacheOrFetch(
    projectId,
    resultsValue.resultsObjectId,
    replicateBy,
    resOptions.data,
  );
  if (optRes.success && optRes.data.status === "ok") {
    const valid = optRes.data.possibleValues;
    const selected = config.d.selectedReplicantValue;
    if (!selected) {
      throw new Error(
        `This figure replicates by "${replicateBy}" and needs a selected replicant value. `
        + `Valid values: ${valid.map((v) => v.label).join(", ")}`,
      );
    }
    if (!valid.some((v) => v.id === selected)) {
      throw new Error(
        `Invalid replicant value "${selected}". Valid values: ${valid.map((v) => v.label).join(", ")}`,
      );
    }
  }
}
