import { unwrap } from "solid-js/store";
import type { PresentationObjectConfig, ProjectState, ResultsValue, SlideDeckConfig } from "lib";
import { instanceState } from "~/state/instance/t1_store";

function snap<T>(value: T): T {
  return structuredClone(unwrap(value));
}

type VizSnapshotBase = {
  projectStateSnapshot: ProjectState;
  instanceDetailSnapshot: ReturnType<typeof snap<typeof instanceState>>;
};

type VizSnapshotWithData = VizSnapshotBase & {
  configSnapshot: PresentationObjectConfig;
  resultsValueSnapshot: ResultsValue;
};

export function snapshotForVizEditor(p: { projectState: ProjectState; config: PresentationObjectConfig; resultsValue: ResultsValue }): VizSnapshotWithData;
export function snapshotForVizEditor(p: { projectState: ProjectState }): VizSnapshotBase;
export function snapshotForVizEditor(p: { projectState: ProjectState; config?: PresentationObjectConfig; resultsValue?: ResultsValue }) {
  const result: Record<string, unknown> = {
    projectStateSnapshot: snap(p.projectState),
    instanceDetailSnapshot: snap(instanceState),
  };
  if (p.config !== undefined) result.configSnapshot = snap(p.config);
  if (p.resultsValue !== undefined) result.resultsValueSnapshot = snap(p.resultsValue);
  return result;
}

export function snapshotForSlideEditor(p: {
  projectState: ProjectState;
  deckConfig: SlideDeckConfig;
}) {
  return {
    projectStateSnapshot: snap(p.projectState),
    instanceDetailSnapshot: snap(instanceState),
    deckConfigSnapshot: snap(p.deckConfig),
  };
}
