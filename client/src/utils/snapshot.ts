import { unwrap } from "solid-js/store";
import type { PresentationObjectConfig, ProjectDetail, ResultsValue, SlideDeckConfig } from "lib";
import { instanceState } from "~/state/instance_state";

function snap<T>(value: T): T {
  return structuredClone(unwrap(value));
}

type VizSnapshotBase = {
  projectDetail: ProjectDetail;
  instanceDetail: ReturnType<typeof snap<typeof instanceState>>;
};

type VizSnapshotWithData = VizSnapshotBase & {
  config: PresentationObjectConfig;
  resultsValue: ResultsValue;
};

export function snapshotForVizEditor(p: { projectDetail: ProjectDetail; config: PresentationObjectConfig; resultsValue: ResultsValue }): VizSnapshotWithData;
export function snapshotForVizEditor(p: { projectDetail: ProjectDetail }): VizSnapshotBase;
export function snapshotForVizEditor(p: { projectDetail: ProjectDetail; config?: PresentationObjectConfig; resultsValue?: ResultsValue }) {
  const result: Record<string, unknown> = {
    projectDetail: snap(p.projectDetail),
    instanceDetail: snap(instanceState),
  };
  if (p.config !== undefined) result.config = snap(p.config);
  if (p.resultsValue !== undefined) result.resultsValue = snap(p.resultsValue);
  return result;
}

export function snapshotForSlideEditor(p: {
  projectDetail: ProjectDetail;
  deckConfig: SlideDeckConfig;
}) {
  return {
    projectDetail: snap(p.projectDetail),
    instanceDetail: snap(instanceState),
    deckConfig: snap(p.deckConfig),
  };
}
