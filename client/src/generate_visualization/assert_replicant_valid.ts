import type { PackageScope, PresentationObjectConfig, ResultsValue } from "lib";
import { AIToolFailure } from "panther";
import {
  formatReplicantLabelForDisplay,
  getFetchConfigFromPresentationObjectConfig,
  getReplicateByProp,
} from "lib";
import { getReplicantOptionsFromCacheOrFetch } from "~/state/products/t2_replicant_options";

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
  scope: PackageScope,
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
    throw new AIToolFailure(resOptions.err);
  }
  // metricId, not resultsObjectId: the run-keyed options route resolves the
  // results object from the manifest itself, and this shares the ONE options
  // cache entry with resolveDefaultReplicant (which keys on the metric).
  const optRes = await getReplicantOptionsFromCacheOrFetch(
    scope,
    resultsValue.id,
    replicateBy,
    resOptions.data,
  );
  if (optRes.success && optRes.data.status === "ok") {
    const valid = optRes.data.possibleValues;
    const selected = config.d.selectedReplicantValue;
    if (!selected) {
      throw new AIToolFailure(
        `This figure replicates by "${replicateBy}" and needs a selected replicant value. `
        + `Valid values: ${valid.map((v) => formatReplicantLabelForDisplay(v.label, replicateBy, undefined)).join(", ")}`,
      );
    }
    if (!valid.some((v) => v.id === selected)) {
      throw new AIToolFailure(
        `Invalid replicant value "${selected}". Valid values: ${valid.map((v) => formatReplicantLabelForDisplay(v.label, replicateBy, undefined)).join(", ")}`,
      );
    }
  }
}
