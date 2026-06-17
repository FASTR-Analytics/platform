import {
  DisaggregationOption,
  PresentationObjectConfig,
  ResultsValue,
  getFetchConfigFromPresentationObjectConfig,
  getReplicateByProp,
} from "lib";
import { getResultsValueInfoForPresentationObjectFromCacheOrFetch } from "~/state/project/t2_presentation_objects";
import { getReplicantOptionsFromCacheOrFetch } from "~/state/project/t2_replicant_options";

// Answers ONLY "what replicant options exist for this config?" — it does NOT
// decide standalone-item vs group (that is contextual: see the dashboard editor
// reconciliation rule). Shared by add-time and edit-time so both derive the
// replicant set the same way.
//   null   → no replicant set (no replicant dimension, or options empty / not ok)
//   object → the replicant dimension + its option set
// Throws on a hard resolve failure (results-value info / fetch-config) so callers
// can surface it like the add flow does.
export async function resolveReplicantStructure(
  projectId: string,
  resultsValue: ResultsValue,
  config: PresentationObjectConfig,
): Promise<
  | null
  | {
      replicateBy: DisaggregationOption;
      replicants: { value: string; label: string }[];
    }
> {
  const replicateBy = getReplicateByProp(config);
  if (!replicateBy) return null;

  const resInfo = await getResultsValueInfoForPresentationObjectFromCacheOrFetch(
    projectId,
    resultsValue.id,
  );
  if (!resInfo.success) throw new Error(resInfo.err);

  // Enumerate the in-scope replicant options. excludeReplicantFilter drops the
  // auto-pin (the currently-previewed value) but KEEPS the user's filterBy — so a
  // replicant filtered to a subset returns exactly that subset. The server now
  // honors the self-column filter (get_possible_values no longer self-strips), so
  // this MUST exclude the pin or the "UNSELECTED" sentinel would empty the list.
  const fcRes = getFetchConfigFromPresentationObjectConfig(
    resultsValue,
    config,
    { excludeReplicantFilter: true },
  );
  if (!fcRes.success) throw new Error(fcRes.err);

  const optRes = await getReplicantOptionsFromCacheOrFetch(
    projectId,
    resultsValue.resultsObjectId,
    replicateBy,
    fcRes.data,
  );
  if (!optRes.success || optRes.data.status !== "ok") return null;

  return {
    replicateBy,
    replicants: optRes.data.possibleValues.map((pv) => ({
      value: pv.id,
      label: pv.label,
    })),
  };
}
