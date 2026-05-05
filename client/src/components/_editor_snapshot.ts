import { unwrap } from "solid-js/store";
import type { PresentationObjectConfig, ProjectState, ResultsValue, SlideDeckConfig } from "lib";
import { instanceState } from "~/state/instance/t1_store";

function snap<T>(value: T): T {
  return structuredClone(unwrap(value));
}

type VizSnapshotBase = {
  projectState: ProjectState;
  instanceDetail: ReturnType<typeof snap<typeof instanceState>>;
};

type VizSnapshotWithData = VizSnapshotBase & {
  config: PresentationObjectConfig;
  resultsValue: ResultsValue;
};

export function snapshotForVizEditor(p: { projectState: ProjectState; config: PresentationObjectConfig; resultsValue: ResultsValue }): VizSnapshotWithData;
export function snapshotForVizEditor(p: { projectState: ProjectState }): VizSnapshotBase;
export function snapshotForVizEditor(p: { projectState: ProjectState; config?: PresentationObjectConfig; resultsValue?: ResultsValue }) {
  const result: Record<string, unknown> = {
    projectState: snap(p.projectState),
    instanceDetail: snap(instanceState),
  };
  if (p.config !== undefined) result.config = snap(p.config);
  if (p.resultsValue !== undefined) result.resultsValue = snap(p.resultsValue);
  return result;
}

export function snapshotForSlideEditor(p: {
  projectState: ProjectState;
  deckConfig: SlideDeckConfig;
}) {
  return {
    projectState: snap(p.projectState),
    instanceDetail: snap(instanceState),
    deckConfig: snap(p.deckConfig),
  };
}
