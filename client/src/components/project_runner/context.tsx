import { LastUpdateTableName, ProjectDetail, ProjectDirtyStates } from "lib";
import { createContext } from "solid-js";
import { Store } from "solid-js/store";

export const ProjectDirtyStateContext = createContext<{
  projectDetail: ProjectDetail;
  refetchProjectDetail: () => Promise<void>;
  projectDirtyStates: ProjectDirtyStates;
  optimisticSetProjectLastUpdated: (lastUpdated: string) => void;
  optimisticSetLastUpdated: (
    tableName: LastUpdateTableName,
    id: string,
    lastUpdated: string,
  ) => void;
  rLogs: Store<Record<string, { latest: string }>>;
  addLastUpdatedListener: (
    listener: (tableName: LastUpdateTableName, ids: string[], timestamp: string) => void
  ) => () => void;
}>();
