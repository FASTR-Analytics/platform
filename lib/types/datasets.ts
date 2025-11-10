// ============================================================================
// Dataset Type Definitions
// ============================================================================

export type DatasetType = "hmis" | "hfa";

export const _POSSIBLE_DATASETS: { datasetType: DatasetType; label: string }[] =
  [
    { datasetType: "hmis", label: "HMIS Data" },
    { datasetType: "hfa", label: "Health Facility Assessment Data" },
  ];
