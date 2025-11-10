import { useContext } from "solid-js";
import { ProjectDirtyStateContext } from "./context";

export function useAnyRunning() {
  const context = useContext(ProjectDirtyStateContext);
  if (!context) {
    throw new Error("can't find ProjectDirtyStateContext");
  }
  return context.projectDirtyStates.anyRunning;
}

export function useProjectDirtyStates() {
  const context = useContext(ProjectDirtyStateContext);
  if (!context) {
    throw new Error("can't find ProjectDirtyStateContext");
  }
  return context.projectDirtyStates;
}

export function useOptimisticSetProjectLastUpdated() {
  const context = useContext(ProjectDirtyStateContext);
  if (!context) {
    throw new Error("can't find ProjectDirtyStateContext");
  }
  return context.optimisticSetProjectLastUpdated;
}

export function useOptimisticSetLastUpdated() {
  const context = useContext(ProjectDirtyStateContext);
  if (!context) {
    throw new Error("can't find ProjectDirtyStateContext");
  }
  return context.optimisticSetLastUpdated;
}

export function useRLogs() {
  const context = useContext(ProjectDirtyStateContext);
  if (!context) {
    throw new Error("can't find ProjectDirtyStateContext");
  }
  return context.rLogs;
}