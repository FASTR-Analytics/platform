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
// valid-value list when a figure has an active replicant but no selectedReplicantValue,
// or an invalid one, so the AI gets a clear error instead of a silent
// auto-default.
//
// The non-AI / interactive render paths deliberately do NOT call this: they
// auto-default via resolveDefaultReplicant so a figure always shows something for
// a human who is clicking around.
export async function assertReplicantValid(
  scope: PackageScope,
  metric: ResultsValue,
  config: PresentationObjectConfig,
): Promise<void> {
  const replicateBy = getReplicateByProp(config);
  if (!replicateBy) return;

  // Options query needs the auto-pin EXCLUDED so it returns all in-scope values.
  const resOptions = getFetchConfigFromPresentationObjectConfig(metric, config, {
    excludeReplicantFilter: true,
  });
  if (!resOptions.success) {
    throw new AIToolFailure(resOptions.err);
  }
  // Keyed by the metric, like resolveDefaultReplicant: the run route resolves
  // the results object itself, so both share one options cache entry.
  const optRes = await getReplicantOptionsFromCacheOrFetch(
    scope,
    metric.id,
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
