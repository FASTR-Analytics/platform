import { LastUpdateTableName, ProjectDirtyStates } from "lib";
import { createContext } from "solid-js";
import { Store } from "solid-js/store";

export const ProjectDirtyStateContext = createContext<{
  projectDirtyStates: ProjectDirtyStates;
  optimisticSetProjectLastUpdated: (lastUpdated: string) => void;
  optimisticSetLastUpdated: (
    tableName: LastUpdateTableName,
    id: string,
    lastUpdated: string,
  ) => void;
  rLogs: Store<Record<string, { latest: string }>>;
}>();
