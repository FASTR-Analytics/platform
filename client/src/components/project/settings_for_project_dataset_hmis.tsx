import { trackStore } from "@solid-primitives/deep";
import {
  DEFAULT_PERIOD_END,
  DEFAULT_PERIOD_START,
  ProjectDetail,
  t,
  t2,
  T,
  type DatasetHmisInfoInProject,
  type DatasetHmisWindowingCommon,
  type InstanceConfigFacilityColumns,
} from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  ProgressBar,
  getProgress,
  timActionButton,
} from "panther";
import {
  Match,
  Switch,
  createEffect,
  createSignal,
  Show,
  onMount,
} from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { WindowingSelector } from "../WindowingSelector";

export function SettingsForProjectDatasetHmis(
  p: EditorComponentProps<
    {
      projectDetail: ProjectDetail;
      facilityColumns: InstanceConfigFacilityColumns;
      hmisInfo: DatasetHmisInfoInProject | undefined;
      indicatorMappingsVersion: string;
      silentRefreshProject: () => Promise<void>;
      autoTriggerSave?: boolean;
    },
    undefined
  >,
) {
  const [isLoadingVersion, setIsLoadingVersion] = createSignal(false);
  const [fetchError, setFetchError] = createSignal<string | undefined>();
  const [hmisVersionId, setHmisVersionId] = createSignal<number | undefined>(
    p.hmisInfo?.version.id,
  );

  const [tempWindowing, setTempWindowing] =
    createStore<DatasetHmisWindowingCommon>(
      p.hmisInfo
        ? {
          ...structuredClone(p.hmisInfo.windowing),
          indicatorType: "common",
        }
        : {
          indicatorType: "common",
          start: DEFAULT_PERIOD_START,
          end: DEFAULT_PERIOD_END,
          takeAllIndicators: true,
          takeAllAdminArea2s: true,
          adminArea2sToInclude: [],
          commonIndicatorsToInclude: [],
        },
    );

  onMount(async () => {
    if (!p.hmisInfo) {
      setIsLoadingVersion(true);
      try {
        const res = await serverActions.getDatasetHmisDetail({});
        if (res.success && res.data.currentVersionId) {
          setHmisVersionId(res.data.currentVersionId);
          setNeedsSave(false);
        } else {
          setFetchError("No HMIS version available");
        }
      } catch (e: any) {
        setFetchError(e.message || "Failed to fetch HMIS version");
      } finally {
        setIsLoadingVersion(false);
      }
    }

    if (p.autoTriggerSave && hmisVersionId()) {
      await save.click();
    }
  });

  const [needsSave, setNeedsSave] = createSignal<boolean>(
    !p.hmisInfo?.windowing,
  );
  let firstRun = true;

  createEffect(() => {
    trackStore(tempWindowing);
    if (firstRun) {
      firstRun = false;
      return;
    }
    setNeedsSave(true);
  });

  const { progressFrom0To100, progressMsg, onProgress } = getProgress();

  const save = timActionButton(
    async () => {
      const newWindowing = unwrap(tempWindowing);

      if (
        !newWindowing.takeAllIndicators &&
        newWindowing.commonIndicatorsToInclude.length === 0
      ) {
        return {
          success: false,
          err: "You must select at least one indicator",
        };
      }

      if (
        !newWindowing.takeAllAdminArea2s &&
        newWindowing.adminArea2sToInclude.length === 0
      ) {
        return {
          success: false,
          err: "You must select at least one admin area",
        };
      }

      if (
        p.facilityColumns.includeOwnership &&
        newWindowing.takeAllFacilityOwnerships === false &&
        (newWindowing.facilityOwnwershipsToInclude === undefined ||
          newWindowing.facilityOwnwershipsToInclude.length === 0)
      ) {
        return {
          success: false,
          err: "You must select at least one facility ownership category",
        };
      }

      if (
        p.facilityColumns.includeTypes &&
        newWindowing.takeAllFacilityTypes === false &&
        (newWindowing.facilityTypesToInclude === undefined ||
          newWindowing.facilityTypesToInclude.length === 0)
      ) {
        return {
          success: false,
          err: "You must select at least one facility ownership category",
        };
      }

      const takeAllFacilityOwnerships =
        p.facilityColumns.includeOwnership &&
        newWindowing.takeAllFacilityOwnerships !== false;

      const facilityOwnwershipsToInclude =
        newWindowing.facilityOwnwershipsToInclude ?? [];

      const takeAllFacilityTypes =
        p.facilityColumns.includeTypes &&
        newWindowing.takeAllFacilityTypes !== false;

      const facilityTypesToInclude = newWindowing.facilityTypesToInclude ?? [];

      return await serverActions.addDatasetToProject(
        {
          projectId: p.projectDetail.id,
          datasetType: "hmis",
          windowing: {
            ...newWindowing,
            takeAllFacilityOwnerships,
            facilityOwnwershipsToInclude,
            takeAllFacilityTypes,
            facilityTypesToInclude,
          },
        },
        onProgress,
      );
    },
    p.silentRefreshProject,
    () => p.close(undefined),
  );

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading={`HMIS data settings`}>
          <div class="ui-gap-sm flex">
            <Button
              onClick={save.click}
              state={save.state()}
              intent="success"
              // disabled={!needsSave()}
              iconName={needsSave() ? "save" : "refresh"}
            >
              {(needsSave() || p.hmisInfo === undefined)
                ? t2(T.FRENCH_UI_STRINGS.save)
                : t2("Re-window with current settings")}
            </Button>
            <Button
              onClick={() => p.close(undefined)}
              intent="neutral"
              iconName="x"
            >
              {t2(T.FRENCH_UI_STRINGS.cancel)}
            </Button>
          </div>
        </HeadingBar>
      }
    >
      <div class="ui-pad">
        <Switch>
          <Match when={save.state().status === "loading"}>
            <ProgressBar
              progressFrom0To100={progressFrom0To100()}
              progressMsg={progressMsg()}
            />
          </Match>
          <Match when={isLoadingVersion()}>
            <div class="">Loading HMIS version...</div>
          </Match>
          <Match when={fetchError()}>
            <div class="text-danger">{fetchError()}</div>
          </Match>
          <Match when={hmisVersionId()}>
            <WindowingSelector
              hmisVersionId={hmisVersionId()!}
              indicatorMappingsVersion={p.indicatorMappingsVersion}
              tempWindowing={tempWindowing}
              setTempWindowing={setTempWindowing}
              includeOrDelete="include"
              facilityColumns={p.facilityColumns}
            />
          </Match>
        </Switch>
      </div>
    </FrameTop>
  );
}
