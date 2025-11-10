import {
  InstanceDetail,
  ProjectDetail,
  _POSSIBLE_DATASETS,
  getCalendar,
  t,
  t2,
  T,
} from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  ProgressBar,
  formatPeriod,
  getEditorWrapper,
  getProgress,
  openAlert,
  timActionButton,
  toNum0,
} from "panther";
import { For, Match, Show, Switch } from "solid-js";
import { serverActions } from "~/server_actions";
import { _SERVER_HOST } from "~/server_actions/config";
import { SettingsForProjectDatasetHmis } from "./settings_for_project_dataset_hmis";

type Props = {
  instanceDetail: InstanceDetail;
  projectDetail: ProjectDetail;
  isGlobalAdmin: boolean;
  attemptGetProjectDetail: () => Promise<void>;
  silentRefreshProject: () => Promise<void>;
};

export function ProjectData(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();
  return (
    <EditorWrapper>
      <FrameTop panelChildren={<HeadingBar heading={"Data"}></HeadingBar>}>
        <div class="ui-pad ui-spy">
          <For each={_POSSIBLE_DATASETS}>
            {(possibleDataset) => {
              const projectDataset = p.projectDetail.projectDatasets.find(
                (d) => d.datasetType === possibleDataset.datasetType,
              );
              return (
                <Switch>
                  <Match
                    when={
                      projectDataset?.datasetType === "hmis" && projectDataset
                    }
                    keyed
                  >
                    {(keyedProjectDatasetHmis) => {
                      const projectVersion = () => keyedProjectDatasetHmis.info.version.id;
                      const instanceVersion = () => p.instanceDetail.datasetVersions.hmis;

                      const stalenessCheck = () => {
                        const reasons: string[] = [];

                        // Dataset version (data changes)
                        const inst = instanceVersion();
                        const proj = projectVersion();
                        if (inst !== undefined && proj < inst) {
                          reasons.push(`Dataset updated (v${proj} → v${inst})`);
                        }

                        // Structure (facilities/admin areas)
                        if (
                          p.instanceDetail.structureLastUpdated &&
                          keyedProjectDatasetHmis.info.structureLastUpdated &&
                          p.instanceDetail.structureLastUpdated > keyedProjectDatasetHmis.info.structureLastUpdated
                        ) {
                          reasons.push("Facilities or admin areas changed");
                        }

                        // Indicators
                        if (
                          p.instanceDetail.cacheVersions.indicatorMappings !== keyedProjectDatasetHmis.info.indicatorMappingsVersion
                        ) {
                          reasons.push("Indicators or mappings changed");
                        }

                        // Facility config
                        if (
                          keyedProjectDatasetHmis.info.facilityColumnsConfig &&
                          JSON.stringify(p.instanceDetail.facilityColumns) !== JSON.stringify(keyedProjectDatasetHmis.info.facilityColumnsConfig)
                        ) {
                          reasons.push("Facility configuration changed");
                        }

                        // Max admin area
                        if (
                          keyedProjectDatasetHmis.info.maxAdminArea !== undefined &&
                          p.instanceDetail.maxAdminArea !== keyedProjectDatasetHmis.info.maxAdminArea
                        ) {
                          reasons.push("Admin area structure changed");
                        }

                        return { isStale: reasons.length > 0, reasons };
                      };

                      const isStale = () => stalenessCheck().isStale;

                      async function editSettings(autoTriggerSave?: boolean) {
                        const _res = await openEditor({
                          element: SettingsForProjectDatasetHmis,
                          props: {
                            projectDetail: p.projectDetail,
                            facilityColumns: p.instanceDetail.facilityColumns,
                            indicatorMappingsVersion:
                              p.instanceDetail.cacheVersions.indicatorMappings,
                            hmisInfo: keyedProjectDatasetHmis.info,
                            silentRefreshProject: p.silentRefreshProject,
                            autoTriggerSave: autoTriggerSave,
                          },
                        });
                      }

                      const disableDataset = timActionButton(
                        () =>
                          serverActions.removeDatasetFromProject({
                            projectId: p.projectDetail.id,
                            dataset_type: "hmis",
                          }),
                        p.silentRefreshProject,
                      );

                      return (
                        <div class="border-base-300 rounded border">
                          <div class="border-base-300 ui-pad flex items-center border-b">
                            <div class="font-700 flex-1 text-lg">
                              {possibleDataset.label}
                              <Show when={isStale()}>
                                <span class="ml-2 bg-warning text-warning-content rounded px-2 py-1 text-xs font-500">
                                  {t("Instance data updated")}
                                </span>
                              </Show>
                            </div>
                            <Show
                              when={
                                !p.projectDetail.isLocked && p.isGlobalAdmin
                              }
                            >
                              <div class="ui-gap-sm flex">
                                <Button
                                  href={`${_SERVER_HOST}/${p.projectDetail.id}/datasets/hmis.csv?t=${Date.now()}`}
                                  download={`hmis.csv`}
                                  outline
                                >
                                  {t2(T.FRENCH_UI_STRINGS.download)}
                                </Button>
                                <Button
                                  onClick={disableDataset.click}
                                  state={disableDataset.state()}
                                  // iconName="x"
                                  outline
                                >
                                  {t2(T.FRENCH_UI_STRINGS.disable)}
                                </Button>
                                <Button
                                  onClick={() => editSettings(undefined)}
                                  iconName="settings"
                                >
                                  {t2(T.FRENCH_UI_STRINGS.settings)}
                                </Button>
                              </div>
                            </Show>
                          </div>
                          <div class="ui-pad ui-spy-sm">
                            <Show when={isStale()}>
                              <div class="ui-spy-sm mb-4 inline-block ui-pad border rounded">
                                <div class="font-700">
                                  {t("Project data is out of date")}
                                </div>
                                <ul class="list-disc pl-5 text-xs space-y-1">
                                  <For each={stalenessCheck().reasons}>
                                    {(reason) => <li>{reason}</li>}
                                  </For>
                                </ul>
                                <div class="">
                                  <Button
                                    onClick={() => editSettings(true)}
                                    intent="primary"
                                    iconName="refresh"
                                  >
                                    {t("Update data")}
                                  </Button>
                                </div>
                              </div>
                            </Show>
                            <div class={`text-xs ${isStale() ? "text-warning" : "text-success"}`}>
                              {t2(T.Données.last_exported)}:{" "}
                              {new Date(
                                keyedProjectDatasetHmis.dateExported,
                              ).toLocaleString()}
                            </div>
                            <div class="ui-spy-sm py-4">
                              <div class="grid grid-cols-12 text-sm">
                                <div class="col-span-4">
                                  {t2(T.FRENCH_UI_STRINGS.time_period)}
                                </div>
                                <div class="col-span-8">
                                  {formatPeriod(
                                    keyedProjectDatasetHmis.info.windowing
                                      .start,
                                    "year-month",
                                    getCalendar(),
                                  )}{" "}
                                  &rarr;{" "}
                                  {formatPeriod(
                                    keyedProjectDatasetHmis.info.windowing.end,
                                    "year-month",
                                    getCalendar(),
                                  )}
                                </div>
                              </div>
                              <div class="grid grid-cols-12 text-sm">
                                <div class="col-span-4">
                                  {t2(T.FRENCH_UI_STRINGS.indicators)}
                                </div>
                                <div class="col-span-8">
                                  {keyedProjectDatasetHmis.info.windowing
                                    .takeAllIndicators
                                    ? t2(T.FRENCH_UI_STRINGS.all_indicators)
                                    : (keyedProjectDatasetHmis.info.windowing.commonIndicatorsToInclude
                                      ?.map((ind) => {
                                        return ind.toUpperCase();
                                      })
                                      .join(", ") ??
                                      t2(T.FRENCH_UI_STRINGS.all_indicators))}
                                </div>
                              </div>
                              <div class="grid grid-cols-12 text-sm">
                                <div class="col-span-4">
                                  {t2(T.FRENCH_UI_STRINGS.admin_areas)}
                                </div>
                                <div class="col-span-8">
                                  {keyedProjectDatasetHmis.info.windowing
                                    .takeAllAdminArea2s
                                    ? t2(T.FRENCH_UI_STRINGS.all_admin_areas)
                                    : (keyedProjectDatasetHmis.info.windowing.adminArea2sToInclude?.join(
                                      ", ",
                                    ) ??
                                      t2(T.FRENCH_UI_STRINGS.all_admin_areas))}
                                </div>
                              </div>
                              <Show
                                when={
                                  p.instanceDetail.facilityColumns
                                    .includeOwnership
                                }
                              >
                                <div class="grid grid-cols-12 text-sm">
                                  <div class="col-span-4">
                                    {t("Facility ownership categories")}
                                  </div>
                                  <div class="col-span-8">
                                    {keyedProjectDatasetHmis.info.windowing
                                      .takeAllFacilityOwnerships !== false
                                      ? t("All facility ownership categories")
                                      : (keyedProjectDatasetHmis.info.windowing.facilityOwnwershipsToInclude?.join(
                                        ", ",
                                      ) ??
                                        t("All facility ownership categories"))}
                                  </div>
                                </div>
                              </Show>
                              <Show
                                when={
                                  p.instanceDetail.facilityColumns.includeTypes
                                }
                              >
                                <div class="grid grid-cols-12 text-sm">
                                  <div class="col-span-4">
                                    {t("Facility types")}
                                  </div>
                                  <div class="col-span-8">
                                    {keyedProjectDatasetHmis.info.windowing
                                      .takeAllFacilityTypes !== false
                                      ? t("All facility types")
                                      : (keyedProjectDatasetHmis.info.windowing.facilityTypesToInclude?.join(
                                        ", ",
                                      ) ?? t("All facility types"))}
                                  </div>
                                </div>
                              </Show>
                            </div>
                            <Show when={keyedProjectDatasetHmis.info.totalRows}>
                              <div class="font-700 grid grid-cols-12 text-sm">
                                <div class="col-span-4">
                                  {t2(T.Données.total_rows)}
                                </div>
                                <div class="col-span-8">
                                  {toNum0(
                                    keyedProjectDatasetHmis.info.totalRows,
                                  )}
                                </div>
                              </div>
                            </Show>
                          </div>
                        </div>
                      );
                    }}
                  </Match>
                  <Match
                    when={
                      projectDataset?.datasetType === "hfa" && projectDataset
                    }
                    keyed
                  >
                    {(keyedProjectDatasetHfa) => {
                      const projectVersion = () => 999999; // TODO: Need to figure out how to handle this
                      const instanceVersion = () => p.instanceDetail.datasetVersions.hfa;
                      const isStale = () => {
                        const inst = instanceVersion();
                        const proj = projectVersion();
                        return inst !== undefined && proj !== undefined && proj < inst;
                      };

                      // async function editSettings() {
                      //   const _res = await openEditor({
                      //     element: SettingsForProjectDatasetHmis,
                      //     props: {
                      //       projectDetail: p.projectDetail,
                      //       indicatorMappingsVersion:
                      //         p.instanceDetail.cacheVersions.indicatorMappings,
                      //       hmisInfo: keyedProjectDatasetHmis.info,
                      //       silentRefreshProject: p.silentRefreshProject,
                      //     },
                      //   });
                      // }

                      const disableDataset = timActionButton(
                        () =>
                          serverActions.removeDatasetFromProject({
                            projectId: p.projectDetail.id,
                            dataset_type: "hfa",
                          }),
                        p.silentRefreshProject,
                      );

                      const updateData = timActionButton(
                        () =>
                          serverActions.addDatasetToProject({
                            projectId: p.projectDetail.id,
                            datasetType: "hfa",
                            windowing: undefined,
                          }),
                        p.silentRefreshProject,
                      );

                      return (
                        <div class="border-base-300 rounded border">
                          <div class="ui-pad border-base-300 flex items-center border-b">
                            <div class="font-700 flex-1 text-lg">
                              {possibleDataset.label}
                              <Show when={isStale()}>
                                <span class="ml-2 bg-warning text-warning-content rounded px-2 py-1 text-xs font-500">
                                  {t("Instance data updated")}
                                </span>
                              </Show>
                            </div>
                            <Show
                              when={
                                !p.projectDetail.isLocked && p.isGlobalAdmin
                              }
                            >
                              <div class="ui-gap-sm flex">
                                {/* <Button
                                  onClick={editSettings}
                                  iconName="settings"
                                >
                                  {t2(T.FRENCH_UI_STRINGS.settings)}
                                </Button> */}
                                <Button
                                  onClick={disableDataset.click}
                                  state={disableDataset.state()}
                                  // iconName="x"
                                  outline
                                >
                                  {t2(T.FRENCH_UI_STRINGS.disable)}
                                </Button>
                              </div>
                            </Show>
                          </div>
                          <div class="ui-pad ui-spy-sm">
                            <Show when={isStale()}>
                              <div class="bg-warning/10 border-warning mb-3 rounded border p-3 text-sm">
                                <div class="font-600 mb-1">
                                  {t("Project data is out of date")}
                                </div>
                                <div class="text-xs">
                                  {t("Project version")}: {projectVersion()}
                                  {" | "}
                                  {t("Instance version")}: {instanceVersion()}
                                </div>
                                <div class="mt-3">
                                  <Button
                                    onClick={updateData.click}
                                    state={updateData.state()}
                                    intent="primary"
                                    iconName="refresh"
                                  >
                                    {t("Update data")}
                                  </Button>
                                </div>
                              </div>
                            </Show>
                            <div class={`text-xs ${isStale() ? "text-warning" : "text-success"}`}>
                              {t2(T.Données.last_exported)}:{" "}
                              {new Date(
                                keyedProjectDatasetHfa.dateExported,
                              ).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  </Match>
                  <Match when={true} keyed>
                    {(_) => {
                      async function enableDatasetHmis() {
                        if (
                          !p.instanceDetail.datasetsWithData.includes(
                            possibleDataset.datasetType,
                          )
                        ) {
                          await openAlert({
                            text: t(
                              "This dataset has no data at the instance level",
                            ),
                            intent: 'danger'
                          });
                          return;
                        }

                        await openEditor({
                          element: SettingsForProjectDatasetHmis,
                          props: {
                            projectDetail: p.projectDetail,
                            facilityColumns: p.instanceDetail.facilityColumns,
                            indicatorMappingsVersion:
                              p.instanceDetail.cacheVersions.indicatorMappings,
                            hmisInfo: undefined,
                            silentRefreshProject: p.silentRefreshProject,
                          },
                        });
                      }

                      const enableDatasetOther = timActionButton(async () => {
                        if (
                          !p.instanceDetail.datasetsWithData.includes(
                            possibleDataset.datasetType,
                          )
                        ) {
                          return {
                            success: false,
                            err: t(
                              "This dataset has no data at the instance level",
                            ),
                          };
                        }

                        return await serverActions.addDatasetToProject({
                          projectId: p.projectDetail.id,
                          datasetType: possibleDataset.datasetType,
                          windowing: undefined,
                        });
                      }, p.silentRefreshProject);

                      return (
                        <div class="ui-pad border-base-300 ui-spy rounded border">
                          <div class="font-700 flex items-center">
                            <div class="flex-1 text-lg">
                              {possibleDataset.label}
                            </div>
                            <div class="">
                              <Show
                                when={
                                  !p.projectDetail.isLocked && p.isGlobalAdmin
                                }
                                fallback={
                                  <div class="font-400 text-neutral text-sm">
                                    {t("Deactivated")}
                                  </div>
                                }
                              >
                                <Button
                                  onClick={
                                    possibleDataset.datasetType === "hmis"
                                      ? enableDatasetHmis
                                      : enableDatasetOther.click
                                  }
                                  state={
                                    possibleDataset.datasetType === "hmis"
                                      ? undefined
                                      : enableDatasetOther.state()
                                  }
                                  outline
                                >
                                  {t2(T.FRENCH_UI_STRINGS.enable)}
                                </Button>
                              </Show>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  </Match>
                </Switch>
              );
            }}
          </For>
        </div>
      </FrameTop>
    </EditorWrapper>
  );
}
