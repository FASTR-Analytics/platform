import {
  LastUpdateTableName,
  ProjectDetail,
  ProjectDirtyStates,
  ProjectSseUpdateMessage,
  parseJsonOrThrow,
  t,
  t2,
  T,
} from "lib";
import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { createStore, reconcile, type Store } from "solid-js/store";
import { _SERVER_HOST } from "~/server_actions/config";
import { Button } from "panther";
import { ProjectDirtyStateContext } from "./context";
import { setGlobalPDS } from "./global_pds";
import type { ConnectionState, Props } from "./types";
import {
  _MAX_CONNECTION_ATTEMPTS,
  createInitialRLogs,
  getRetryDelay,
  validateTimestamp,
} from "./utils";
import { serverActions } from "~/server_actions";

export function ProjectRunnerProvider(p: Props) {
  const [connectAttempts, setConnectionAttempts] = createSignal<number>(0);
  const [connectionState, setConnectionState] =
    createSignal<ConnectionState>("disconnected");

  // Project detail store - all properties initialized for proper reactivity
  const [projectDetail, setProjectDetail] = createStore<ProjectDetail>({
    id: "",
    label: "",
    aiContext: "",
    thisUserRole: "viewer",
    isLocked: false,
    projectDatasets: [],
    projectModules: [],
    metrics: [],
    visualizations: [],
    visualizationFolders: [],
    reports: [],
    slideDecks: [],
    projectUsers: [],
  });
  const [isProjectReady, setIsProjectReady] = createSignal(false);

  async function fetchProjectDetail() {
    const res = await serverActions.getProjectDetail({ projectId: p.projectId });
    if (res.success) {
      setProjectDetail(reconcile(res.data));  // Efficiently diffs and updates only changed properties
    }
    // TODO: Handle error case
  }

  // Context

  const [projectDirtyStates, setProjectDirtyStates] =
    createStore<ProjectDirtyStates>({
      isReady: false,
      projectLastUpdated: "",
      anyRunning: false,
      moduleDirtyStates: {},
      anyModuleLastRun: "",
      moduleLastRun: {},
      lastUpdated: {
        datasets: {},
        modules: {},
        presentation_objects: {},
        reports: {},
        report_items: {},
        slide_decks: {},
        slides: {},
      },
    });

  function safeSet(
    prop: "projectLastUpdated" | "anyModuleLastRun",
    newLastUpdated: string,
  ) {
    const existingTimestamp = projectDirtyStates[prop];
    if (validateTimestamp(newLastUpdated, existingTimestamp, prop)) {
      setProjectDirtyStates(prop, newLastUpdated);
    }
  }

  function safeSetModuleLastRun(id: string, newLastUpdated: string) {
    const existingTimestamp = projectDirtyStates.moduleLastRun?.[id];
    if (
      validateTimestamp(
        newLastUpdated,
        existingTimestamp,
        `moduleLastRun[${id}]`,
      )
    ) {
      setProjectDirtyStates("moduleLastRun", id, newLastUpdated);
    }
  }

  function safeSetLastUpdated(
    tableName: LastUpdateTableName,
    id: string,
    newLastUpdated: string,
  ) {
    const existingTimestamp = projectDirtyStates.lastUpdated[tableName]?.[id];
    if (
      validateTimestamp(
        newLastUpdated,
        existingTimestamp,
        `${tableName}[${id}]`,
      )
    ) {
      setProjectDirtyStates("lastUpdated", tableName, id, newLastUpdated);
    }
  }

  function optimisticSetProjectLastUpdated(lastUpdated: string) {
    safeSet("projectLastUpdated", lastUpdated);
  }

  function optimisticSetLastUpdated(
    tableName: LastUpdateTableName,
    id: string,
    lastUpdated: string,
  ) {
    safeSetLastUpdated(tableName, id, lastUpdated);
  }

  let evtSource: EventSource | null = null;
  let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  const [rLogs, setRLogs] =
    createStore<Record<string, { latest: string }>>(createInitialRLogs());

  function safeSetRLog(moduleId: string, text: string) {
    if (!rLogs[moduleId]) {
      setRLogs(moduleId, { latest: text });
    } else {
      setRLogs(moduleId, "latest", text);
    }
  }

  onMount(async () => {
    // Set global PDS reference for cache system (async contexts)
    setGlobalPDS(projectDirtyStates);

    // Fetch initial project detail
    await fetchProjectDetail();
    setIsProjectReady(true);

    setUpEventSource();
  });

  function setUpEventSource() {
    // Prevent duplicate connections
    if (evtSource && evtSource.readyState !== EventSource.CLOSED) {
      return;
    }

    setConnectionState("connecting");
    setConnectionAttempts((prev) => prev + 1);
    const url = `${_SERVER_HOST}/project_dirty_states/${p.projectId}`;
    console.log("Connecting to SSE:", url);
    evtSource = new EventSource(url, {
      withCredentials: true,
    });
    evtSource.onopen = () => {
      setConnectionState("connected");
      setConnectionAttempts(0);
    };
    evtSource.onmessage = async (event) => {
      let bm: ProjectSseUpdateMessage;
      try {
        bm = parseJsonOrThrow<ProjectSseUpdateMessage>(event.data);
      } catch (error) {
        console.error(
          "Failed to parse SSE message:",
          error,
          "Raw data:",
          event.data,
        );
        return;
      }

      if (bm.type === "starting_project_dirty_states") {
        console.log("PDS", "Starting project dirty states", bm);
        setProjectDirtyStates("isReady", bm.pds.isReady);
        safeSet("projectLastUpdated", bm.pds.projectLastUpdated);
        setProjectDirtyStates("anyRunning", bm.pds.anyRunning);
        for (const [key, value] of Object.entries(bm.pds.moduleDirtyStates)) {
          setProjectDirtyStates("moduleDirtyStates", key, value);
        }
        safeSet("anyModuleLastRun", bm.pds.anyModuleLastRun);
        for (const [key, value] of Object.entries(bm.pds.moduleLastRun)) {
          safeSetModuleLastRun(key, value);
        }
        for (const [tableName, tableData] of Object.entries(
          bm.pds.lastUpdated,
        )) {
          for (const [id, lastUpdated] of Object.entries(tableData)) {
            safeSetLastUpdated(
              tableName as LastUpdateTableName,
              id,
              lastUpdated,
            );
          }
        }
      } else if (bm.type === "any_running") {
        console.log("PDS", "anyRunning", bm.anyRunning);
        setProjectDirtyStates("anyRunning", bm.anyRunning);
      } else if (bm.type === "r_script") {
        safeSetRLog(bm.moduleId, bm.text);
      } else if (bm.type === "module_dirty_state_and_last_run") {
        for (const id of bm.ids) {
          console.log("PDS", "module", id, bm.dirtyOrRunStatus, bm.lastRun);
          setProjectDirtyStates("moduleDirtyStates", id, bm.dirtyOrRunStatus);
          if (bm.dirtyOrRunStatus === "ready" && bm.lastRun) {
            safeSetModuleLastRun(id, bm.lastRun);
            safeSet("anyModuleLastRun", bm.lastRun);
          }
          if (bm.dirtyOrRunStatus === "queued") {
            safeSetRLog(id, "Queued to run...");
          }
          if (bm.dirtyOrRunStatus === "running") {
            safeSetRLog(id, "Running...");
          }
        }
      } else if (bm.type === "last_updated") {
        for (const id of bm.ids) {
          console.log("PDS", "lastUpdated", bm);
          safeSetLastUpdated(bm.tableName, id, bm.lastUpdated);
        }
      } else if (bm.type === "project_updated") {
        safeSet("projectLastUpdated", bm.lastUpdated);
        // Refetch project detail when project metadata changes
        fetchProjectDetail();
      }
    };
    evtSource.onerror = () => {
      const readyState = evtSource?.readyState;
      console.log("EventSource error, readyState:", readyState);

      // Handle different error scenarios
      if (readyState === EventSource.CONNECTING) {
        console.warn("EventSource failed to connect");
      } else if (readyState === EventSource.OPEN) {
        console.warn("EventSource connection lost");
      } else {
        console.warn("EventSource error in unknown state");
      }

      setConnectionState("failed");

      if (evtSource) {
        evtSource.close();
        evtSource = null;
      }

      // Only retry if we haven't exceeded max attempts
      if (connectAttempts() <= _MAX_CONNECTION_ATTEMPTS) {
        retryEventSource();
      } else {
        console.error("Max connection attempts reached, giving up");
      }
    };
  }

  function retryEventSource() {
    const currentAttempts = connectAttempts();
    if (currentAttempts > _MAX_CONNECTION_ATTEMPTS) {
      setConnectionState("failed");
      return;
    }

    const delay = getRetryDelay(currentAttempts);
    console.log(
      `Retrying event source in ${delay}ms (attempt ${currentAttempts})`,
    );

    // Clear any existing retry timeout
    if (retryTimeoutId) {
      clearTimeout(retryTimeoutId);
    }

    retryTimeoutId = setTimeout(setUpEventSource, delay);
  }

  onCleanup(() => {
    // Clear retry timeout
    if (retryTimeoutId) {
      clearTimeout(retryTimeoutId);
      retryTimeoutId = null;
    }

    // Close EventSource
    if (evtSource) {
      evtSource.close();
      evtSource = null;
    }

    setConnectionState("disconnected");
  });

  return (
    <Show
      when={connectAttempts() <= _MAX_CONNECTION_ATTEMPTS}
      fallback={
        <div class="ui-pad ui-spy-sm">
          <div class="">{t("Cannot connect to project.")}</div>
          <div class="">
            <Button href="/">{t("Go home")}</Button>
          </div>
        </div>
      }
    >
      <Show
        when={projectDirtyStates.isReady && isProjectReady()}
        fallback={
          <div class="ui-pad">
            {connectionState() === "connecting"
              ? t2(T.FRENCH_UI_STRINGS.connecting_to_project)
              : connectionState() === "failed"
                ? t2(T.FRENCH_UI_STRINGS.connection_failed)
                : t2(T.FRENCH_UI_STRINGS.connecting_to_project)}
            {connectAttempts() > 1
              ? ` (${t2(T.FRENCH_UI_STRINGS.retrying)} ${connectAttempts() - 1})`
              : ""}
            ...
          </div>
        }
      >
        <ProjectDirtyStateContext.Provider
          value={{
            projectDetail,
            refetchProjectDetail: fetchProjectDetail,
            projectDirtyStates,
            optimisticSetProjectLastUpdated,
            optimisticSetLastUpdated,
            rLogs,
          }}
        >
          {p.children}
        </ProjectDirtyStateContext.Provider>
      </Show>
    </Show>
  );
}
