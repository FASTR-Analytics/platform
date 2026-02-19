import {
  InstanceDetail,
  ProjectDetail,
  _POSSIBLE_DATASETS,
  getCalendar,
  t3,
  TC,
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
import { useProjectDetail } from "~/components/project_runner/mod";

type Props = {
  instanceDetail: InstanceDetail;
  isGlobalAdmin: boolean;
};

export function ProjectData(p: Props) {
  const projectDetail = useProjectDetail();
  const { openEditor, EditorWrapper } = getEditorWrapper();
  return (
    <EditorWrapper>
      <FrameTop panelChildren={<HeadingBar heading={t3({ en: "Data", fr: "Données" })}
        class="border-base-300" ensureHeightAsIfButton></HeadingBar>}>
        <div class="ui-pad ui-spy">
          <For each={_POSSIBLE_DATASETS}>
            {(possibleDataset) => {
              return (
                <Switch>
                  <Match
                    when={
                      projectDetail.projectDatasets.find(
                        (d) => d.datasetType === possibleDataset.datasetType && d.datasetType === "hmis"
                      ) as Extract<typeof projectDetail.projectDatasets[number], { datasetType: "hmis" }> | undefined
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
                          reasons.push(t3({ en: `Dataset updated (v${proj} → v${inst})`, fr: `Données mises à jour (v${proj} → v${inst})` }));
                        }

                        // Structure (facilities/admin areas)
                        if (
                          p.instanceDetail.structureLastUpdated &&
                          keyedProjectDatasetHmis.info.structureLastUpdated &&
                          p.instanceDetail.structureLastUpdated > keyedProjectDatasetHmis.info.structureLastUpdated
                        ) {
                          reasons.push(t3({ en: "Facilities or admin areas changed", fr: "Établissements ou unités administratives modifiés" }));
                        }

                        // Indicators
                        if (
                          p.instanceDetail.cacheVersions.indicatorMappings !== keyedProjectDatasetHmis.info.indicatorMappingsVersion
                        ) {
                          reasons.push(t3({ en: "Indicators or mappings changed", fr: "Indicateurs ou correspondances modifiés" }));
                        }

                        // Facility config
                        if (
                          keyedProjectDatasetHmis.info.facilityColumnsConfig &&
                          JSON.stringify(p.instanceDetail.facilityColumns) !== JSON.stringify(keyedProjectDatasetHmis.info.facilityColumnsConfig)
                        ) {
                          reasons.push(t3({ en: "Facility configuration changed", fr: "Configuration des établissements modifiée" }));
                        }

                        // Max admin area
                        if (
                          keyedProjectDatasetHmis.info.maxAdminArea !== undefined &&
                          p.instanceDetail.maxAdminArea !== keyedProjectDatasetHmis.info.maxAdminArea
                        ) {
                          reasons.push(t3({ en: "Admin area structure changed", fr: "Structure des unités administratives modifiée" }));
                        }

                        return { isStale: reasons.length > 0, reasons };
                      };

                      const isStale = () => stalenessCheck().isStale;

                      async function editSettings(autoTriggerSave?: boolean) {
                        const _res = await openEditor({
                          element: SettingsForProjectDatasetHmis,
                          props: {
                            projectDetail: projectDetail,
                            facilityColumns: p.instanceDetail.facilityColumns,
                            indicatorMappingsVersion:
                              p.instanceDetail.cacheVersions.indicatorMappings,
                            hmisInfo: keyedProjectDatasetHmis.info,
                            autoTriggerSave: autoTriggerSave,
                          },
                        });
                      }

                      const disableDataset = timActionButton(() =>
                        serverActions.removeDatasetFromProject({
                          projectId: projectDetail.id,
                          dataset_type: "hmis",
                        }),
                      );

                      return (
                        <div class="border-base-300 rounded border">
                          <div class="border-base-300 ui-pad flex items-center border-b">
                            <div class="font-700 flex-1 text-lg">
                              {possibleDataset.label}
                              <Show when={isStale()}>
                                <span class="ml-2 bg-warning text-warning-content rounded px-2 py-1 text-xs font-500">
                                  {t3({ en: "Instance data updated", fr: "Données de l'instance mises à jour" })}
                                </span>
                              </Show>
                            </div>
                            <Show
                              when={
                                !projectDetail.isLocked && p.isGlobalAdmin
                              }
                            >
                              <div class="ui-gap-sm flex">
                                <Button
                                  href={`${_SERVER_HOST}/${projectDetail.id}/datasets/hmis.csv?t=${Date.now()}`}
                                  download={`hmis.csv`}
                                  outline
                                >
                                  {t3(TC.download)}
                                </Button>
                                <Button
                                  onClick={disableDataset.click}
                                  state={disableDataset.state()}
                                  // iconName="x"
                                  outline
                                >
                                  {t3({ en: "Disable", fr: "Désactiver" })}
                                </Button>
                                <Button
                                  onClick={() => editSettings(undefined)}
                                  iconName="settings"
                                >
                                  {t3(TC.settings)}
                                </Button>
                              </div>
                            </Show>
                          </div>
                          <div class="ui-pad ui-spy-sm">
                            <Show when={isStale()}>
                              <div class="ui-spy-sm mb-4 inline-block ui-pad border rounded">
                                <div class="font-700">
                                  {t3({ en: "Project data is out of date", fr: "Les données du projet ne sont plus à jour" })}
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
                                    {t3({ en: "Update data", fr: "Mettre à jour les données" })}
                                  </Button>
                                </div>
                              </div>
                            </Show>
                            <div class={`text-xs ${isStale() ? "text-warning" : "text-success"}`}>
                              {t3({ en: "Last exported from instance into project", fr: "Dernière exportation de l'instance vers le projet" })}:{" "}
                              {new Date(
                                keyedProjectDatasetHmis.dateExported,
                              ).toLocaleString()}
                            </div>
                            <div class="ui-spy-sm py-4">
                              <div class="grid grid-cols-12 text-sm">
                                <div class="col-span-4">
                                  {t3({ en: "Time period", fr: "Période" })}
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
                                  {t3({ en: "Indicators", fr: "Indicateurs" })}
                                </div>
                                <div class="col-span-8">
                                  {keyedProjectDatasetHmis.info.windowing
                                    .takeAllIndicators
                                    ? t3({ en: "All indicators", fr: "Tous les indicateurs" })
                                    : (keyedProjectDatasetHmis.info.windowing.commonIndicatorsToInclude
                                      ?.map((ind) => {
                                        return ind.toUpperCase();
                                      })
                                      .join(", ") ??
                                      t3({ en: "All indicators", fr: "Tous les indicateurs" }))}
                                </div>
                              </div>
                              <div class="grid grid-cols-12 text-sm">
                                <div class="col-span-4">
                                  {t3({ en: "Admin areas", fr: "Unités administratives" })}
                                </div>
                                <div class="col-span-8">
                                  {keyedProjectDatasetHmis.info.windowing
                                    .takeAllAdminArea2s
                                    ? t3({ en: "All admin areas", fr: "Toutes les unités administratives" })
                                    : (keyedProjectDatasetHmis.info.windowing.adminArea2sToInclude?.join(
                                      ", ",
                                    ) ??
                                      t3({ en: "All admin areas", fr: "Toutes les unités administratives" }))}
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
                                    {t3({ en: "Facility ownership categories", fr: "Catégories de propriété des établissements" })}
                                  </div>
                                  <div class="col-span-8">
                                    {keyedProjectDatasetHmis.info.windowing
                                      .takeAllFacilityOwnerships !== false
                                      ? t3({ en: "All facility ownership categories", fr: "Toutes les catégories de propriété" })
                                      : (keyedProjectDatasetHmis.info.windowing.facilityOwnwershipsToInclude?.join(
                                        ", ",
                                      ) ??
                                        t3({ en: "All facility ownership categories", fr: "Toutes les catégories de propriété" }))}
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
                                    {t3({ en: "Facility types", fr: "Types d'établissements" })}
                                  </div>
                                  <div class="col-span-8">
                                    {keyedProjectDatasetHmis.info.windowing
                                      .takeAllFacilityTypes !== false
                                      ? t3({ en: "All facility types", fr: "Tous les types d'établissements" })
                                      : (keyedProjectDatasetHmis.info.windowing.facilityTypesToInclude?.join(
                                        ", ",
                                      ) ?? t3({ en: "All facility types", fr: "Tous les types d'établissements" }))}
                                  </div>
                                </div>
                              </Show>
                            </div>
                            <Show when={keyedProjectDatasetHmis.info.totalRows}>
                              <div class="font-700 grid grid-cols-12 text-sm">
                                <div class="col-span-4">
                                  {t3({ en: "Total rows", fr: "Nombre total de lignes" })}
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
                      projectDetail.projectDatasets.find(
                        (d) => d.datasetType === possibleDataset.datasetType && d.datasetType === "hfa"
                      ) as Extract<typeof projectDetail.projectDatasets[number], { datasetType: "hfa" }> | undefined
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

                      const disableDataset = timActionButton(() =>
                        serverActions.removeDatasetFromProject({
                          projectId: projectDetail.id,
                          dataset_type: "hfa",
                        }),
                      );

                      const updateData = timActionButton(() =>
                        serverActions.addDatasetToProject({
                          projectId: projectDetail.id,
                          datasetType: "hfa",
                          windowing: undefined,
                        }),
                      );

                      return (
                        <div class="border-base-300 rounded border">
                          <div class="ui-pad border-base-300 flex items-center border-b">
                            <div class="font-700 flex-1 text-lg">
                              {possibleDataset.label}
                              <Show when={isStale()}>
                                <span class="ml-2 bg-warning text-warning-content rounded px-2 py-1 text-xs font-500">
                                  {t3({ en: "Instance data updated", fr: "Données de l'instance mises à jour" })}
                                </span>
                              </Show>
                            </div>
                            <Show
                              when={
                                !projectDetail.isLocked && p.isGlobalAdmin
                              }
                            >
                              <div class="ui-gap-sm flex">
                                {/* <Button
                                  onClick={editSettings}
                                  iconName="settings"
                                >
                                  {t3(TC.settings)}
                                </Button> */}
                                <Button
                                  onClick={disableDataset.click}
                                  state={disableDataset.state()}
                                  // iconName="x"
                                  outline
                                >
                                  {t3({ en: "Disable", fr: "Désactiver" })}
                                </Button>
                              </div>
                            </Show>
                          </div>
                          <div class="ui-pad ui-spy-sm">
                            <Show when={isStale()}>
                              <div class="bg-warning/10 border-warning mb-3 rounded border p-3 text-sm">
                                <div class="font-600 mb-1">
                                  {t3({ en: "Project data is out of date", fr: "Les données du projet ne sont plus à jour" })}
                                </div>
                                <div class="text-xs">
                                  {t3({ en: "Project version", fr: "Version du projet" })}: {projectVersion()}
                                  {" | "}
                                  {t3({ en: "Instance version", fr: "Version de l'instance" })}: {instanceVersion()}
                                </div>
                                <div class="mt-3">
                                  <Button
                                    onClick={updateData.click}
                                    state={updateData.state()}
                                    intent="primary"
                                    iconName="refresh"
                                  >
                                    {t3({ en: "Update data", fr: "Mettre à jour les données" })}
                                  </Button>
                                </div>
                              </div>
                            </Show>
                            <div class={`text-xs ${isStale() ? "text-warning" : "text-success"}`}>
                              {t3({ en: "Last exported from instance into project", fr: "Dernière exportation de l'instance vers le projet" })}:{" "}
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
                            text: t3({ en: "This dataset has no data at the instance level", fr: "Ce jeu de données ne contient aucune donnée au niveau de l'instance" }),
                            intent: 'danger'
                          });
                          return;
                        }

                        await openEditor({
                          element: SettingsForProjectDatasetHmis,
                          props: {
                            projectDetail: projectDetail,
                            facilityColumns: p.instanceDetail.facilityColumns,
                            indicatorMappingsVersion:
                              p.instanceDetail.cacheVersions.indicatorMappings,
                            hmisInfo: undefined,
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
                            err: t3({ en: "This dataset has no data at the instance level", fr: "Ce jeu de données ne contient aucune donnée au niveau de l'instance" }),
                          };
                        }

                        return await serverActions.addDatasetToProject({
                          projectId: projectDetail.id,
                          datasetType: possibleDataset.datasetType,
                          windowing: undefined,
                        });
                      });

                      return (
                        <div class="ui-pad border-base-300 ui-spy rounded border">
                          <div class="font-700 flex items-center">
                            <div class="flex-1 text-lg">
                              {possibleDataset.label}
                            </div>
                            <div class="">
                              <Show
                                when={
                                  !projectDetail.isLocked && p.isGlobalAdmin
                                }
                                fallback={
                                  <div class="font-400 text-neutral text-sm">
                                    {t3({ en: "Deactivated", fr: "Désactivé" })}
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
                                  {t3({ en: "Enable", fr: "Activer" })}
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
