import { unwrap } from "solid-js/store";
import type { InstanceDetail, PresentationObjectConfig, ProjectDetail, ResultsValue, SlideDeckConfig } from "lib";

function snap<T>(value: T): T {
  return structuredClone(unwrap(value));
}

type VizSnapshotBase = {
  projectDetail: ProjectDetail;
  instanceDetail: InstanceDetail;
};

type VizSnapshotWithData = VizSnapshotBase & {
  config: PresentationObjectConfig;
  resultsValue: ResultsValue;
};

export function snapshotForVizEditor(p: VizSnapshotWithData): VizSnapshotWithData;
export function snapshotForVizEditor(p: VizSnapshotBase): VizSnapshotBase;
export function snapshotForVizEditor(p: VizSnapshotBase & { config?: PresentationObjectConfig; resultsValue?: ResultsValue }) {
  const result: Record<string, unknown> = {
    projectDetail: snap(p.projectDetail),
    instanceDetail: snap(p.instanceDetail),
  };
  if (p.config !== undefined) result.config = snap(p.config);
  if (p.resultsValue !== undefined) result.resultsValue = snap(p.resultsValue);
  return result;
}

export function snapshotForSlideEditor(p: {
  projectDetail: ProjectDetail;
  instanceDetail: InstanceDetail;
  deckConfig: SlideDeckConfig;
}) {
  return {
    projectDetail: snap(p.projectDetail),
    instanceDetail: snap(p.instanceDetail),
    deckConfig: snap(p.deckConfig),
  };
}
