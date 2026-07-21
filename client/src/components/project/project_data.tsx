import {
  getCalendar,
  hashFacilityColumnsConfig,
  parseAa3CompositeKey,
  t3,
  TC,
} from "lib";
import {
  Button,
  Checkbox,
  FrameTop,
  HeadingBar,
  formatPeriod,
  getEditorWrapper,
  openAlert,
  createButtonAction,
  toNum0,
} from "panther";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { _SERVER_HOST } from "~/server_actions";
import { SettingsForProjectDatasetHmis } from "./settings_for_project_dataset_hmis";
import { SettingsForProjectDatasetHfa } from "./settings_for_project_dataset_hfa";
import { projectState } from "~/state/project/t1_store";

type Props = {};

export function ProjectData(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();
  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <div class="h-full w-full" data-cursor-zone="header">
            <HeadingBar
              heading={t3({ en: "Data", fr: "Données", pt: "Dados" })}
              class="border-base-300"
              ensureHeightAsIfButton
            ></HeadingBar>
          </div>
        }
      >
        <div class="ui-pad ui-spy" data-page-cursor-surface>
          {/* HMIS Dataset */}
          <Switch>
            <Match
              when={
                projectState.projectDatasets.find(
                  (d) => d.datasetType === "hmis",
                ) as
                  | Extract<
                      (typeof projectState.projectDatasets)[number],
                      { datasetType: "hmis" }
                    >
                  | undefined
              }
              keyed
            >
              {(keyedProjectDatasetHmis) => {
                const [skipModuleRerunHmis, setSkipModuleRerunHmis] =
                  createSignal(false);
                const projectVersion = () =>
                  keyedProjectDatasetHmis.info.version.id;
                const instanceVersion = () =>
                  instanceState.datasetVersions.hmis;

                const stalenessCheck = () => {
                  const reasons: string[] = [];

                  // Dataset version (data changes)
                  const inst = instanceVersion();
                  const proj = projectVersion();
                  if (inst !== undefined && proj < inst) {
                    reasons.push(
                      t3({
                        en: `Dataset updated (v${proj} → v${inst})`,
                        fr: `Données mises à jour (v${proj} → v${inst})`,
                        pt: `Conjunto de dados atualizado (v${proj} → v${inst})`,
                      }),
                    );
                  }

                  // Structure (facilities/admin areas)
                  if (
                    instanceState.structureLastUpdated &&
                    keyedProjectDatasetHmis.info.structureLastUpdated &&
                    instanceState.structureLastUpdated >
                      keyedProjectDatasetHmis.info.structureLastUpdated
                  ) {
                    reasons.push(
                      t3({
                        en: "Facilities or admin areas changed",
                        fr: "Établissements ou unités administratives modifiés",
                        pt: "Estabelecimentos de saúde ou zonas administrativas alterados",
                      }),
                    );
                  }

                  // Indicators
                  if (
                    instanceState.indicatorMappingsVersion !==
                    keyedProjectDatasetHmis.info.indicatorMappingsVersion
                  ) {
                    reasons.push(
                      t3({
                        en: "Indicators or mappings changed",
                        fr: "Indicateurs ou correspondances modifiés",
                        pt: "Indicadores ou correspondências alterados",
                      }),
                    );
                  }

                  // Facility config
                  if (
                    keyedProjectDatasetHmis.info.facilityColumnsConfig &&
                    JSON.stringify(instanceState.facilityColumns) !==
                      JSON.stringify(
                        keyedProjectDatasetHmis.info.facilityColumnsConfig,
                      )
                  ) {
                    reasons.push(
                      t3({
                        en: "Facility configuration changed",
                        fr: "Configuration des établissements modifiée",
                        pt: "Configuração dos estabelecimentos de saúde alterada",
                      }),
                    );
                  }

                  // Max admin area
                  if (
                    keyedProjectDatasetHmis.info.maxAdminArea !== undefined &&
                    instanceState.maxAdminArea !==
                      keyedProjectDatasetHmis.info.maxAdminArea
                  ) {
                    reasons.push(
                      t3({
                        en: "Admin area structure changed",
                        fr: "Structure des unités administratives modifiée",
                        pt: "Estrutura das zonas administrativas alterada",
                      }),
                    );
                  }

                  // Calculated indicators
                  if (
                    instanceState.calculatedIndicatorsVersion !==
                    keyedProjectDatasetHmis.info.calculatedIndicatorsVersion
                  ) {
                    reasons.push(
                      t3({
                        en: "Calculated indicators changed",
                        fr: "Indicateurs calculés modifiés",
                        pt: "Indicadores calculados alterados",
                      }),
                    );
                  }

                  return { isStale: reasons.length > 0, reasons };
                };

                const isStale = () => stalenessCheck().isStale;

                async function editSettings(autoTriggerSave?: boolean) {
                  await openEditor({
                    element: SettingsForProjectDatasetHmis,
                    props: {
                      projectState: projectState,
                      facilityColumns: instanceState.facilityColumns,
                      indicatorMappingsVersion:
                        instanceState.indicatorMappingsVersion,
                      hmisInfo: keyedProjectDatasetHmis.info,
                      autoTriggerSave: autoTriggerSave,
                      skipModuleRerun: skipModuleRerunHmis(),
                    },
                  });
                }

                const disableDataset = createButtonAction(() =>
                  serverActions.removeDatasetFromProject({
                    projectId: projectState.id,
                    dataset_type: "hmis",
                  }),
                );

                return (
                  <div class="rounded border">
                    <div class="ui-pad flex items-center border-b">
                      <div class="font-700 flex-1 text-lg">
                        {t3({
                          en: "HMIS Data",
                          fr: "Données SNIS",
                          pt: "Dados SNIS",
                        })}
                        <Show when={isStale()}>
                          <span class="bg-warning text-warning-content ml-2 rounded px-2 py-1 text-xs">
                            {t3({
                              en: "Instance data updated",
                              fr: "Données de l'instance mises à jour",
                              pt: "Dados da instância atualizados",
                            })}
                          </span>
                        </Show>
                      </div>
                      <Show
                        when={
                          !projectState.isLocked &&
                          instanceState.currentUserIsGlobalAdmin
                        }
                      >
                        <div class="ui-gap-sm flex">
                          <Button
                            href={`${_SERVER_HOST}/${projectState.id}/datasets/hmis.csv?t=${Date.now()}`}
                            download={`hmis.csv`}
                            outline
                          >
                            {t3(TC.download)}
                          </Button>
                          <Button
                            onClick={disableDataset.click}
                            state={disableDataset.state()}
                            outline
                          >
                            {t3({
                              en: "Disable",
                              fr: "Désactiver",
                              pt: "Desativar",
                            })}
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
                        <div class="ui-spy-sm ui-pad mb-4 inline-block rounded border">
                          <div class="font-700">
                            {t3({
                              en: "Project data is out of date",
                              fr: "Les données du projet ne sont plus à jour",
                              pt: "Os dados do projeto estão desatualizados",
                            })}
                          </div>
                          <ul class="list-disc space-y-1 pl-5 text-xs">
                            <For each={stalenessCheck().reasons}>
                              {(reason) => <li>{reason}</li>}
                            </For>
                          </ul>
                          <div class="py-2">
                            <Checkbox
                              label={t3({
                                en: "Don't re-run modules on data update",
                                fr: "Ne pas réexécuter les modules lors de la mise à jour des données",
                                pt: "Não reexecutar os módulos ao atualizar os dados",
                              })}
                              checked={skipModuleRerunHmis()}
                              onChange={setSkipModuleRerunHmis}
                            />
                          </div>
                          <div class="">
                            <Button
                              onClick={() => editSettings(true)}
                              intent="primary"
                              iconName="refresh"
                            >
                              {t3({
                                en: "Update data",
                                fr: "Mettre à jour les données",
                                pt: "Atualizar os dados",
                              })}
                            </Button>
                          </div>
                        </div>
                      </Show>
                      <div
                        class={`text-xs ${isStale() ? "text-warning" : "text-success"}`}
                      >
                        {t3({
                          en: "Last exported from instance into project",
                          fr: "Dernière exportation de l'instance vers le projet",
                          pt: "Última exportação da instância para o projeto",
                        })}
                        :{" "}
                        {new Date(
                          keyedProjectDatasetHmis.dateExported,
                        ).toLocaleString()}
                      </div>
                      <div class="ui-spy-sm py-4">
                        <div class="grid grid-cols-12 text-sm">
                          <div class="col-span-4">
                            {t3({
                              en: "Time period",
                              fr: "Période",
                              pt: "Período",
                            })}
                          </div>
                          <div class="col-span-8">
                            {formatPeriod(
                              keyedProjectDatasetHmis.info.windowing.start,
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
                            {t3({
                              en: "Indicators",
                              fr: "Indicateurs",
                              pt: "Indicadores",
                            })}
                          </div>
                          <div class="col-span-8">
                            {keyedProjectDatasetHmis.info.windowing
                              .takeAllIndicators
                              ? t3({
                                  en: "All indicators",
                                  fr: "Tous les indicateurs",
                                  pt: "Todos os indicadores",
                                })
                              : (keyedProjectDatasetHmis.info.windowing.commonIndicatorsToInclude
                                  ?.map((ind) => {
                                    return ind.toUpperCase();
                                  })
                                  .join(", ") ??
                                t3({
                                  en: "All indicators",
                                  fr: "Tous les indicateurs",
                                  pt: "Todos os indicadores",
                                }))}
                          </div>
                        </div>
                        <div class="grid grid-cols-12 text-sm">
                          <div class="col-span-4">
                            {t3({
                              en: "Admin areas",
                              fr: "Unités administratives",
                              pt: "Zonas administrativas",
                            })}
                          </div>
                          <div class="col-span-8">
                            {!(
                              keyedProjectDatasetHmis.info.windowing
                                .takeAllAdminArea3s ?? true
                            ) &&
                            (keyedProjectDatasetHmis.info.windowing
                              .adminArea3sToInclude?.length ?? 0) > 0
                              ? (() => {
                                  const grouped = new Map<string, string[]>();
                                  for (const k of keyedProjectDatasetHmis.info
                                    .windowing.adminArea3sToInclude!) {
                                    const { aa3, aa2 } =
                                      parseAa3CompositeKey(k);
                                    if (!grouped.has(aa2)) grouped.set(aa2, []);
                                    grouped.get(aa2)!.push(aa3);
                                  }
                                  return Array.from(grouped.entries())
                                    .map(
                                      ([aa2, aa3s]) =>
                                        `${aa3s.join(", ")} (${aa2})`,
                                    )
                                    .join("; ");
                                })()
                              : !keyedProjectDatasetHmis.info.windowing
                                    .takeAllAdminArea2s &&
                                  (keyedProjectDatasetHmis.info.windowing
                                    .adminArea2sToInclude?.length ?? 0) > 0
                                ? keyedProjectDatasetHmis.info.windowing.adminArea2sToInclude!.join(
                                    ", ",
                                  )
                                : t3({
                                    en: "All admin areas",
                                    fr: "Toutes les unités administratives",
                                    pt: "Todas as zonas administrativas",
                                  })}
                          </div>
                        </div>
                        <Show
                          when={instanceState.facilityColumns.includeOwnership}
                        >
                          <div class="grid grid-cols-12 text-sm">
                            <div class="col-span-4">
                              {t3({
                                en: "Facility ownership categories",
                                fr: "Catégories de propriété des établissements",
                                pt: "Categorias de propriedade dos estabelecimentos de saúde",
                              })}
                            </div>
                            <div class="col-span-8">
                              {keyedProjectDatasetHmis.info.windowing
                                .takeAllFacilityOwnerships !== false
                                ? t3({
                                    en: "All facility ownership categories",
                                    fr: "Toutes les catégories de propriété",
                                    pt: "Todas as categorias de propriedade dos estabelecimentos de saúde",
                                  })
                                : (keyedProjectDatasetHmis.info.windowing.facilityOwnwershipsToInclude?.join(
                                    ", ",
                                  ) ??
                                  t3({
                                    en: "All facility ownership categories",
                                    fr: "Toutes les catégories de propriété",
                                    pt: "Todas as categorias de propriedade dos estabelecimentos de saúde",
                                  }))}
                            </div>
                          </div>
                        </Show>
                        <Show when={instanceState.facilityColumns.includeTypes}>
                          <div class="grid grid-cols-12 text-sm">
                            <div class="col-span-4">
                              {t3({
                                en: "Facility types",
                                fr: "Types d'établissements",
                                pt: "Tipos de estabelecimentos de saúde",
                              })}
                            </div>
                            <div class="col-span-8">
                              {keyedProjectDatasetHmis.info.windowing
                                .takeAllFacilityTypes !== false
                                ? t3({
                                    en: "All facility types",
                                    fr: "Tous les types d'établissements",
                                    pt: "Todos os tipos de estabelecimentos de saúde",
                                  })
                                : (keyedProjectDatasetHmis.info.windowing.facilityTypesToInclude?.join(
                                    ", ",
                                  ) ??
                                  t3({
                                    en: "All facility types",
                                    fr: "Tous les types d'établissements",
                                    pt: "Todos os tipos de estabelecimentos de saúde",
                                  }))}
                            </div>
                          </div>
                        </Show>
                      </div>
                      <Show when={keyedProjectDatasetHmis.info.totalRows}>
                        <div class="font-700 grid grid-cols-12 text-sm">
                          <div class="col-span-4">
                            {t3({
                              en: "Total rows",
                              fr: "Nombre total de lignes",
                              pt: "Total de linhas",
                            })}
                          </div>
                          <div class="col-span-8">
                            {toNum0(keyedProjectDatasetHmis.info.totalRows)}
                          </div>
                        </div>
                      </Show>
                      <div class="grid grid-cols-12 pt-4 text-sm">
                        <div class="col-span-4">
                          {t3({
                            en: "Calculated indicators",
                            fr: "Indicateurs calculés",
                            pt: "Indicadores calculados",
                          })}
                        </div>
                        <div class="col-span-8">
                          <Show
                            when={
                              keyedProjectDatasetHmis.info
                                .calculatedIndicatorsVersion
                            }
                            fallback={
                              <span class="text-warning">
                                {t3({
                                  en: "Not snapshotted (re-export to include)",
                                  fr: "Non capturé (réexporter pour inclure)",
                                  pt: "Não capturado (reexportar para incluir)",
                                })}
                              </span>
                            }
                          >
                            <span
                              class={
                                instanceState.calculatedIndicatorsVersion ===
                                keyedProjectDatasetHmis.info
                                  .calculatedIndicatorsVersion
                                  ? "text-success"
                                  : "text-warning"
                              }
                            >
                              {instanceState.calculatedIndicatorsVersion ===
                              keyedProjectDatasetHmis.info
                                .calculatedIndicatorsVersion
                                ? t3({
                                    en: "Up to date",
                                    fr: "À jour",
                                    pt: "Atualizado",
                                  })
                                : t3({
                                    en: "Out of date",
                                    fr: "Obsolète",
                                    pt: "Desatualizado",
                                  })}
                            </span>
                          </Show>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }}
            </Match>
            <Match when={true}>
              {(() => {
                async function enableDatasetHmis() {
                  if (!instanceState.datasetsWithData.includes("hmis")) {
                    await openAlert({
                      text: t3({
                        en: "This dataset has no data at the instance level",
                        fr: "Ce jeu de données ne contient aucune donnée au niveau de l'instance",
                        pt: "Este conjunto de dados não contém dados ao nível da instância",
                      }),
                      intent: "danger",
                    });
                    return;
                  }

                  await openEditor({
                    element: SettingsForProjectDatasetHmis,
                    props: {
                      projectState: projectState,
                      facilityColumns: instanceState.facilityColumns,
                      indicatorMappingsVersion:
                        instanceState.indicatorMappingsVersion,
                      hmisInfo: undefined,
                    },
                  });
                }

                return (
                  <div class="ui-pad ui-spy rounded border">
                    <div class="font-700 flex items-center">
                      <div class="flex-1 text-lg">
                        {t3({
                          en: "HMIS Data",
                          fr: "Données SNIS",
                          pt: "Dados SNIS",
                        })}
                      </div>
                      <div class="">
                        <Show
                          when={
                            !projectState.isLocked &&
                            instanceState.currentUserIsGlobalAdmin
                          }
                          fallback={
                            <div class="font-400 text-base-content-muted text-sm">
                              {t3({
                                en: "Deactivated",
                                fr: "Désactivé",
                                pt: "Desativado",
                              })}
                            </div>
                          }
                        >
                          <Button onClick={enableDatasetHmis} outline>
                            {t3({ en: "Enable", fr: "Activer", pt: "Ativar" })}
                          </Button>
                        </Show>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </Match>
          </Switch>

          {/* HFA Dataset */}
          <Switch>
            <Match
              when={
                projectState.projectDatasets.find(
                  (d) => d.datasetType === "hfa",
                ) as
                  | Extract<
                      (typeof projectState.projectDatasets)[number],
                      { datasetType: "hfa" }
                    >
                  | undefined
              }
              keyed
            >
              {(keyedProjectDatasetHfa) => {
                const [skipModuleRerun, setSkipModuleRerun] =
                  createSignal(false);

                const stalenessCheck = () => {
                  const info = keyedProjectDatasetHfa.info;

                  if (info._legacy) {
                    return {
                      isStale: true,
                      reasons: [
                        t3({
                          en: "Exported before staleness tracking was added — re-export to enable change detection",
                          fr: "Exporté avant le suivi de mise à jour — réexporter pour activer la détection",
                          pt: "Exportado antes da adição do controlo de desatualização — reexportar para ativar a deteção de alterações",
                        }),
                      ],
                    };
                  }

                  const checks: {
                    instance: string | undefined;
                    project: string | undefined;
                    label: { en: string; fr: string; pt?: string };
                  }[] = [
                    {
                      instance: instanceState.hfaCacheHash,
                      project: info.hfaCacheHash,
                      label: {
                        en: "HFA dataset updated",
                        fr: "Données HFA mises à jour",
                        pt: "Conjunto de dados HFA atualizado",
                      },
                    },
                    {
                      instance: instanceState.hfaIndicatorsVersion,
                      project: info.hfaIndicatorsVersion,
                      label: {
                        en: "HFA indicators changed",
                        fr: "Indicateurs HFA modifiés",
                        pt: "Indicadores HFA alterados",
                      },
                    },
                    {
                      instance: instanceState.structureLastUpdated,
                      project: info.structureLastUpdated,
                      label: {
                        en: "Facilities, admin areas, or sampling weights changed",
                        fr: "Établissements, unités administratives ou pondérations d'échantillonnage modifiés",
                        pt: "Estabelecimentos de saúde, zonas administrativas ou pesos de amostragem alterados",
                      },
                    },
                    {
                      instance: hashFacilityColumnsConfig(
                        instanceState.facilityColumns,
                      ),
                      project: info.facilityColumnsHash,
                      label: {
                        en: "Facility configuration changed",
                        fr: "Configuration des établissements modifiée",
                        pt: "Configuração dos estabelecimentos de saúde alterada",
                      },
                    },
                  ];

                  const reasons = checks
                    .filter((c) => c.instance !== c.project)
                    .map((c) => t3(c.label));

                  return { isStale: reasons.length > 0, reasons };
                };

                const isStale = () => stalenessCheck().isStale;

                const disableDataset = createButtonAction(() =>
                  serverActions.removeDatasetFromProject({
                    projectId: projectState.id,
                    dataset_type: "hfa",
                  }),
                );

                const updateData = createButtonAction(() =>
                  serverActions.addDatasetToProject({
                    projectId: projectState.id,
                    datasetType: "hfa",
                    windowing: undefined,
                    serviceCategoryScope:
                      keyedProjectDatasetHfa.info.serviceCategoryScope ?? [],
                    skipModuleRerun: skipModuleRerun(),
                  }),
                );

                async function editHfaSettings() {
                  await openEditor({
                    element: SettingsForProjectDatasetHfa,
                    props: {
                      projectState: projectState,
                      hfaInfo: keyedProjectDatasetHfa.info,
                      skipModuleRerun: skipModuleRerun(),
                    },
                  });
                }

                return (
                  <div class="rounded border">
                    <div class="ui-pad flex items-center border-b">
                      <div class="font-700 flex-1 text-lg">
                        {t3({
                          en: "HFA Data",
                          fr: "Données d'enquêtes FOSA",
                          pt: "Dados de inquéritos FOSA",
                        })}
                        <Show when={isStale()}>
                          <span class="bg-warning text-warning-content ml-2 rounded px-2 py-1 text-xs">
                            {t3({
                              en: "Instance data updated",
                              fr: "Données de l'instance mises à jour",
                              pt: "Dados da instância atualizados",
                            })}
                          </span>
                        </Show>
                      </div>
                      <Show
                        when={
                          !projectState.isLocked &&
                          instanceState.currentUserIsGlobalAdmin
                        }
                      >
                        <div class="ui-gap-sm flex">
                          <Button
                            onClick={disableDataset.click}
                            state={disableDataset.state()}
                            outline
                          >
                            {t3({
                              en: "Disable",
                              fr: "Désactiver",
                              pt: "Desativar",
                            })}
                          </Button>
                          <Button onClick={editHfaSettings} iconName="settings">
                            {t3(TC.settings)}
                          </Button>
                        </div>
                      </Show>
                    </div>
                    <div class="ui-pad ui-spy-sm">
                      <Show when={isStale()}>
                        <div class="ui-spy-sm ui-pad mb-4 inline-block rounded border">
                          <div class="font-700">
                            {t3({
                              en: "Project data is out of date",
                              fr: "Les données du projet ne sont plus à jour",
                              pt: "Os dados do projeto estão desatualizados",
                            })}
                          </div>
                          <ul class="list-disc space-y-1 pl-5 text-xs">
                            <For each={stalenessCheck().reasons}>
                              {(reason) => <li>{reason}</li>}
                            </For>
                          </ul>
                          <div class="py-2">
                            <Checkbox
                              label={t3({
                                en: "Don't re-run modules on data update",
                                fr: "Ne pas réexécuter les modules lors de la mise à jour des données",
                                pt: "Não reexecutar os módulos ao atualizar os dados",
                              })}
                              checked={skipModuleRerun()}
                              onChange={setSkipModuleRerun}
                            />
                          </div>
                          <div class="">
                            <Button
                              onClick={updateData.click}
                              state={updateData.state()}
                              intent="primary"
                              iconName="refresh"
                            >
                              {t3({
                                en: "Update data",
                                fr: "Mettre à jour les données",
                                pt: "Atualizar os dados",
                              })}
                            </Button>
                          </div>
                        </div>
                      </Show>
                      <div
                        class={`text-xs ${isStale() ? "text-warning" : "text-success"}`}
                      >
                        {t3({
                          en: "Last exported from instance into project",
                          fr: "Dernière exportation de l'instance vers le projet",
                          pt: "Última exportação da instância para o projeto",
                        })}
                        :{" "}
                        {new Date(
                          keyedProjectDatasetHfa.dateExported,
                        ).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              }}
            </Match>
            <Match when={true}>
              {(() => {
                async function enableDatasetHfa() {
                  if (!instanceState.datasetsWithData.includes("hfa")) {
                    return;
                  }
                  await openEditor({
                    element: SettingsForProjectDatasetHfa,
                    props: {
                      projectState: projectState,
                      hfaInfo: undefined,
                    },
                  });
                }

                return (
                  <div class="ui-pad ui-spy rounded border">
                    <div class="font-700 flex items-center">
                      <div class="flex-1 text-lg">
                        {t3({
                          en: "HFA Data",
                          fr: "Données d'enquêtes FOSA",
                          pt: "Dados de inquéritos FOSA",
                        })}
                      </div>
                      <div class="">
                        <Show
                          when={
                            !projectState.isLocked &&
                            instanceState.currentUserIsGlobalAdmin
                          }
                          fallback={
                            <div class="font-400 text-base-content-muted text-sm">
                              {t3({
                                en: "Deactivated",
                                fr: "Désactivé",
                                pt: "Desativado",
                              })}
                            </div>
                          }
                        >
                          <Button onClick={enableDatasetHfa} outline>
                            {t3({ en: "Enable", fr: "Activer", pt: "Ativar" })}
                          </Button>
                        </Show>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </Match>
          </Switch>

          {/* ICEH Dataset */}
          <Switch>
            <Match
              when={
                projectState.projectDatasets.find(
                  (d) => d.datasetType === "iceh",
                ) as
                  | Extract<
                      (typeof projectState.projectDatasets)[number],
                      { datasetType: "iceh" }
                    >
                  | undefined
              }
              keyed
            >
              {(keyedProjectDatasetIceh) => {
                const [skipModuleRerun, setSkipModuleRerun] =
                  createSignal(false);

                const stalenessCheck = () => {
                  const info = keyedProjectDatasetIceh.info;
                  if (info.icehCacheHash !== instanceState.icehCacheHash) {
                    return {
                      isStale: true,
                      reasons: [
                        t3({
                          en: "ICEH data updated",
                          fr: "Données ICEH mises à jour",
                          pt: "Dados ICEH atualizados",
                        }),
                      ],
                    };
                  }
                  return { isStale: false, reasons: [] };
                };

                const isStale = () => stalenessCheck().isStale;

                const disableDataset = createButtonAction(() =>
                  serverActions.removeDatasetFromProject({
                    projectId: projectState.id,
                    dataset_type: "iceh",
                  }),
                );

                const updateData = createButtonAction(() =>
                  serverActions.addDatasetToProject({
                    projectId: projectState.id,
                    datasetType: "iceh",
                    windowing: undefined,
                    skipModuleRerun: skipModuleRerun(),
                  }),
                );

                return (
                  <div class="rounded border">
                    <div class="ui-pad flex items-center border-b">
                      <div class="font-700 flex-1 text-lg">
                        {t3({
                          en: "ICEH Equity Data",
                          fr: "Données d'équité ICEH",
                          pt: "Dados de equidade ICEH",
                        })}
                        <Show when={isStale()}>
                          <span class="bg-warning text-warning-content ml-2 rounded px-2 py-1 text-xs">
                            {t3({
                              en: "Instance data updated",
                              fr: "Données de l'instance mises à jour",
                              pt: "Dados da instância atualizados",
                            })}
                          </span>
                        </Show>
                      </div>
                      <Show
                        when={
                          !projectState.isLocked &&
                          instanceState.currentUserIsGlobalAdmin
                        }
                      >
                        <div class="ui-gap-sm flex">
                          <Button
                            onClick={disableDataset.click}
                            state={disableDataset.state()}
                            outline
                          >
                            {t3({
                              en: "Disable",
                              fr: "Désactiver",
                              pt: "Desativar",
                            })}
                          </Button>
                        </div>
                      </Show>
                    </div>
                    <div class="ui-pad ui-spy-sm">
                      <Show when={isStale()}>
                        <div class="ui-spy-sm ui-pad mb-4 inline-block rounded border">
                          <div class="font-700">
                            {t3({
                              en: "Project data is out of date",
                              fr: "Les données du projet ne sont plus à jour",
                              pt: "Os dados do projeto estão desatualizados",
                            })}
                          </div>
                          <ul class="list-disc space-y-1 pl-5 text-xs">
                            <For each={stalenessCheck().reasons}>
                              {(reason) => <li>{reason}</li>}
                            </For>
                          </ul>
                          <div class="py-2">
                            <Checkbox
                              label={t3({
                                en: "Don't re-run modules on data update",
                                fr: "Ne pas réexécuter les modules lors de la mise à jour des données",
                                pt: "Não reexecutar os módulos ao atualizar os dados",
                              })}
                              checked={skipModuleRerun()}
                              onChange={setSkipModuleRerun}
                            />
                          </div>
                          <div class="">
                            <Button
                              onClick={updateData.click}
                              state={updateData.state()}
                              intent="primary"
                              iconName="refresh"
                            >
                              {t3({
                                en: "Update data",
                                fr: "Mettre à jour les données",
                                pt: "Atualizar os dados",
                              })}
                            </Button>
                          </div>
                        </div>
                      </Show>
                      <div
                        class={`text-xs ${isStale() ? "text-warning" : "text-success"}`}
                      >
                        {t3({
                          en: "Last exported from instance into project",
                          fr: "Dernière exportation de l'instance vers le projet",
                          pt: "Última exportação da instância para o projeto",
                        })}
                        :{" "}
                        {new Date(
                          keyedProjectDatasetIceh.dateExported,
                        ).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              }}
            </Match>
            <Match when={true}>
              {(() => {
                const enableDatasetIceh = createButtonAction(async () => {
                  if (!instanceState.datasetsWithData.includes("iceh")) {
                    return {
                      success: false,
                      err: t3({
                        en: "This dataset has no data at the instance level",
                        fr: "Ce jeu de données ne contient aucune donnée au niveau de l'instance",
                        pt: "Este conjunto de dados não contém dados ao nível da instância",
                      }),
                    };
                  }

                  return await serverActions.addDatasetToProject({
                    projectId: projectState.id,
                    datasetType: "iceh",
                    windowing: undefined,
                  });
                });

                return (
                  <div class="ui-pad ui-spy rounded border">
                    <div class="font-700 flex items-center">
                      <div class="flex-1 text-lg">
                        {t3({
                          en: "ICEH Equity Data",
                          fr: "Données d'équité ICEH",
                          pt: "Dados de equidade ICEH",
                        })}
                      </div>
                      <div class="">
                        <Show
                          when={
                            !projectState.isLocked &&
                            instanceState.currentUserIsGlobalAdmin
                          }
                          fallback={
                            <div class="font-400 text-base-content-muted text-sm">
                              {t3({
                                en: "Deactivated",
                                fr: "Désactivé",
                                pt: "Desativado",
                              })}
                            </div>
                          }
                        >
                          <Button
                            onClick={enableDatasetIceh.click}
                            state={enableDatasetIceh.state()}
                            outline
                          >
                            {t3({ en: "Enable", fr: "Activer", pt: "Ativar" })}
                          </Button>
                        </Show>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </Match>
          </Switch>
        </div>
      </FrameTop>
    </EditorWrapper>
  );
}
