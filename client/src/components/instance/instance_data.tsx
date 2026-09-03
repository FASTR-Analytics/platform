import { t3, type FacilityFamily } from "lib";
import { Card, FrameTop, openComponent, toNum0 } from "panther";
import { HeadingBar } from "panther";
import { For, Match, Show, Switch, createSignal } from "solid-js";
import { Dhis2ManageConnection } from "../_shared/dhis2_credentials/manage_connection";
import { HfaIndicatorsManager } from "../indicator_manager_hfa/hfa_indicators_manager";
import { IndicatorsManager } from "../indicator_manager_hmis/indicators_manager";
import { InstanceDatasetHfa } from "../instance_dataset_hfa";
import { InstanceDatasetHmis } from "../instance_dataset_hmis";
import { InstanceDatasetIceh } from "../instance_dataset_iceh";
import { InstanceHfaTimePoints } from "../instance_hfa_time_points";
import { Facilities } from "../structure";
import { AdminAreaLabels } from "../structure/admin_area_labels";
import { FamilyConfiguration } from "../structure/family_configuration";
import { HfaWeights } from "../structure/hfa_weights";
import { GeoJsonManager } from "../instance_geojson/geojson_manager";
import { PopulationManager } from "../instance_population/population_manager";
import {
  instanceState,
  maxDepth,
  structureSchemaForFamily,
} from "~/state/instance/t1_store";
import { getAdminAreaLabel } from "~/state/instance/_util_disaggregation_label";

type Props = {};

export function InstanceData(p: Props) {
  const [selectedDataSource, setSelectedDatasource] = createSignal<
    string | undefined
  >(undefined);

  const canConfigureData = () =>
    instanceState.currentUserIsGlobalAdmin ||
    instanceState.currentUserPermissions.can_configure_data;

  // The Configuration cards inherit the deleted Settings tab's gate, so who
  // can change structure config is unchanged.
  const canConfigureSettings = () =>
    instanceState.currentUserIsGlobalAdmin ||
    instanceState.currentUserPermissions.can_configure_settings;

  const enabledColumnCount = (family: FacilityFamily) => {
    const schema = structureSchemaForFamily(family);
    return [
      schema.includeNames,
      schema.includeTypes,
      schema.includeOwnership,
      schema.includeCustom1,
      schema.includeCustom2,
      schema.includeCustom3,
      schema.includeCustom4,
      schema.includeCustom5,
    ].filter(Boolean).length;
  };

  const isAdminAreaLabelSet = (level: 2 | 3 | 4) =>
    !!instanceState.adminAreaLabels[`label${level}`];

  const hasCustomAdminAreaLabel = () =>
    ([2, 3, 4] as const).some((level) => isAdminAreaLabelSet(level));

  const geojsonLevels = (family: FacilityFamily) =>
    instanceState.geojsonMaps
      .filter((g) => g.family === family)
      .map((g) => g.adminAreaLevel);

  async function openDhis2Credentials() {
    await openComponent({ element: Dhis2ManageConnection, props: {} });
  }

  return (
    <Switch>
      <Match when={selectedDataSource() === "config_hmis"}>
        <FamilyConfiguration
          family="hmis"
          backToInstance={() => setSelectedDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "config_hfa"}>
        <FamilyConfiguration
          family="hfa"
          backToInstance={() => setSelectedDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "admin_area_labels"}>
        <AdminAreaLabels
          backToInstance={() => setSelectedDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "facilities_hmis"}>
        <Facilities
          family="hmis"
          backToInstance={() => setSelectedDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "facilities_hfa"}>
        <Facilities
          family="hfa"
          backToInstance={() => setSelectedDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "hfa_weights"}>
        <HfaWeights backToInstance={() => setSelectedDatasource(undefined)} />
      </Match>
      <Match when={selectedDataSource() === "hfa_indicators"}>
        <HfaIndicatorsManager
          backToInstance={() => setSelectedDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "indicators"}>
        <IndicatorsManager
          backToInstance={() => setSelectedDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "hmis"} keyed>
        <InstanceDatasetHmis
          backToInstance={() => setSelectedDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "hfa"} keyed>
        <InstanceDatasetHfa
          backToInstance={() => setSelectedDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "iceh"} keyed>
        <InstanceDatasetIceh
          backToInstance={() => setSelectedDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "hfa_time_points"}>
        <InstanceHfaTimePoints
          backToInstance={() => setSelectedDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "geojson_hmis"}>
        <GeoJsonManager
          family="hmis"
          backToInstance={() => setSelectedDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "population"}>
        <PopulationManager
          backToInstance={() => setSelectedDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "geojson_hfa"}>
        <GeoJsonManager
          family="hfa"
          backToInstance={() => setSelectedDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource()} keyed>
        <div class="ui-pad">
          {t3({
            en: "No display component for this dataset",
            fr: "Aucun composant d'affichage pour ce jeu de données",
            pt: "Nenhum componente de exibição para este conjunto de dados",
          })}
        </div>
      </Match>
      <Match when={true}>
        <FrameTop
          panelChildren={
            <HeadingBar
              tonal
              heading={t3({ en: "Data", fr: "Données", pt: "Dados" })}
            >
            </HeadingBar>
          }
        >
          <div class="ui-pad overflow-auto">
            <div class="space-y-14">
              {/* General — the one setting that is not per-registry */}
              <div class="ui-spy">
                <div class="ui-spy-sm">
                  <div class="font-700 text-lg">
                    {t3({ en: "General", fr: "Général", pt: "Geral" })}
                  </div>
                  <div class="border-b" />
                </div>
                <div class="ui-gap grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                  <Show when={canConfigureSettings()}>
                    <Card
                      onClick={() => setSelectedDatasource("admin_area_labels")}
                    >
                      <div class="ui-spy-sm">
                        <div class="font-700 pb-2 text-sm">
                          {t3({
                            en: "Admin area labels",
                            fr: "Libellés des unités administratives",
                            pt: "Rótulos das zonas administrativas",
                          })}
                        </div>
                        {/* The names themselves, so the current naming is
                            readable without opening the editor. Green marks a
                            level the instance has actually named; unnamed
                            levels fall back to the generic default. */}
                        <Show
                          when={hasCustomAdminAreaLabel()}
                          fallback={
                            <div class="text-danger text-xs">
                              {t3({
                                en: "Not set — using default names",
                                fr: "Non définis — noms par défaut utilisés",
                                pt: "Não definidos — a usar nomes predefinidos",
                              })}
                            </div>
                          }
                        >
                          <div class="ui-spy-sm text-xs">
                            <For
                              each={([2, 3, 4] as const).filter(
                                (level) => maxDepth() >= level,
                              )}
                            >
                              {(level) => (
                                <div
                                  class="ui-gap flex justify-between"
                                  classList={{
                                    "text-success": isAdminAreaLabelSet(level),
                                    "text-base-content-muted":
                                      !isAdminAreaLabelSet(level),
                                  }}
                                >
                                  <span>
                                    {t3({
                                      en: `Admin area ${level}`,
                                      fr: `Unité administrative ${level}`,
                                      pt: `Zona administrativa ${level}`,
                                    })}
                                    :
                                  </span>
                                  <span>{t3(getAdminAreaLabel(level))}</span>
                                </div>
                              )}
                            </For>
                          </div>
                        </Show>
                      </div>
                    </Card>
                  </Show>
                </div>
              </div>

              {/* HMIS */}
              <div class="ui-spy" data-tour="instance-data-hmis">
                <div class="ui-spy-sm">
                  <div class="font-700 text-lg">
                    {t3({ en: "HMIS", fr: "SNIS", pt: "HMIS" })}
                  </div>
                  <div class="border-b" />
                </div>
                <div class="ui-gap grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                  <Show when={canConfigureSettings()}>
                    <Card
                      onClick={() => setSelectedDatasource("config_hmis")}
                    >
                      <div class="ui-spy-sm">
                        <div class="font-700 pb-2 text-sm">
                          {t3({
                            en: "Configuration",
                            fr: "Configuration",
                            pt: "Configuração",
                          })}
                        </div>
                        <div class="ui-spy-sm text-success text-xs">
                          <div class="ui-gap flex justify-between">
                            <span>
                              {t3({
                                en: "Admin area depth",
                                fr: "Profondeur des unités administratives",
                                pt: "Profundidade das zonas administrativas",
                              })}
                              :
                            </span>
                            <span class="font-mono">
                              {structureSchemaForFamily("hmis").adminDepth}
                            </span>
                          </div>
                          <div class="ui-gap flex justify-between">
                            <span>
                              {t3({
                                en: "Facility columns",
                                fr: "Colonnes des établissements",
                                pt: "Colunas dos estabelecimentos",
                              })}
                              :
                            </span>
                            <span class="font-mono">
                              {toNum0(enabledColumnCount("hmis"))}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Show>
                  <Show when={canConfigureData()}>
                    <Card onClick={openDhis2Credentials}>
                      <div class="ui-spy-sm">
                        <div class="font-700 pb-2 text-sm">
                          {t3({
                            en: "DHIS2 connection",
                            fr: "Connexion DHIS2",
                            pt: "Ligação DHIS2",
                          })}
                        </div>
                        <Show
                          when={instanceState.dhis2ConnectionUrl}
                          fallback={
                            <div class="text-danger text-xs">
                              {t3({
                                en: "No connection configured",
                                fr: "Aucune connexion configurée",
                                pt: "Nenhuma ligação configurada",
                              })}
                            </div>
                          }
                          keyed
                        >
                          {(url) => (
                            <div class="ui-gap text-success flex justify-between text-xs">
                              <span>
                                {t3({ en: "Server", fr: "Serveur", pt: "Servidor" })}:
                              </span>
                              <span class="truncate">{url}</span>
                            </div>
                          )}
                        </Show>
                      </div>
                    </Card>
                  </Show>
                  <Card
                    onClick={() => setSelectedDatasource("facilities_hmis")}
                  >
                    <div class="ui-spy-sm">
                      <div class="font-700 pb-2 text-sm">
                        {t3({
                          en: "Facilities",
                          fr: "Établissements",
                          pt: "Estabelecimentos de saúde",
                        })}
                      </div>
                      <Show
                        when={
                          (instanceState.structure?.hmis.facilities ?? 0) > 0 &&
                          instanceState.structure?.hmis.facilities
                        }
                        fallback={
                          <div class="text-danger text-xs">
                            {t3({
                              en: "No facilities imported",
                              fr: "Aucun établissement importé",
                              pt: "Nenhum estabelecimento de saúde importado",
                            })}
                          </div>
                        }
                        keyed
                      >
                        {(keyedCount) => (
                          <div class="ui-spy-sm text-success text-xs">
                            <div class="ui-gap flex justify-between">
                              <span>
                                {t3({
                                  en: "Facilities",
                                  fr: "Établissements",
                                  pt: "Estabelecimentos de saúde",
                                })}
                                :
                              </span>
                              <span class="font-mono">{toNum0(keyedCount)}</span>
                            </div>
                            {/* Admin areas are derived from these rows, so they
                                are reported here rather than as their own card. */}
                            <For
                              each={([2, 3, 4] as const).filter(
                                (level) =>
                                  structureSchemaForFamily("hmis").adminDepth >=
                                    level,
                              )}
                            >
                              {(level) => (
                                <div class="ui-gap flex justify-between">
                                  <span>{t3(getAdminAreaLabel(level))}:</span>
                                  <span class="font-mono">
                                    {toNum0(
                                      instanceState.structure?.hmis[
                                        `adminArea${level}s`
                                      ] ?? 0,
                                    )}
                                  </span>
                                </div>
                              )}
                            </For>
                          </div>
                        )}
                      </Show>
                    </div>
                  </Card>
                  <Card
                    onClick={() => setSelectedDatasource("indicators")}
                  >
                    <div class="ui-spy-sm">
                      <div class="font-700 pb-2 text-sm">
                        {t3({
                          en: "Indicators",
                          fr: "Indicateurs",
                          pt: "Indicadores",
                        })}
                      </div>
                      <Show
                        when={
                          instanceState.indicators.commonIndicators > 0 &&
                          instanceState.indicators.commonIndicators
                        }
                        fallback={
                          <div class="text-danger text-xs">
                            {t3({
                              en: "No common indicators",
                              fr: "Aucun indicateur commun",
                              pt: "Nenhum indicador comum",
                            })}
                          </div>
                        }
                        keyed
                      >
                        {(keyedNumber) => (
                          <div class="ui-spy-sm text-success text-xs">
                            <div class="ui-gap flex justify-between">
                              <span>
                                {t3({
                                  en: "Common indicators",
                                  fr: "Indicateurs communs",
                                  pt: "Indicadores comuns",
                                })}
                                :
                              </span>
                              <span class="font-mono">
                                {toNum0(keyedNumber)}
                              </span>
                            </div>
                          </div>
                        )}
                      </Show>
                      <Show
                        when={
                          instanceState.indicators.rawIndicators > 0 &&
                          instanceState.indicators.rawIndicators
                        }
                        fallback={
                          <div class="text-danger text-xs">
                            {t3({
                              en: "No DHIS2 indicators",
                              fr: "Aucun indicateur DHIS2",
                              pt: "Nenhum indicador DHIS2",
                            })}
                          </div>
                        }
                        keyed
                      >
                        {(keyedNumber) => (
                          <div class="ui-spy-sm text-success text-xs">
                            <div class="ui-gap flex justify-between">
                              <span>
                                {t3({
                                  en: "DHIS2 indicators",
                                  fr: "Indicateurs DHIS2",
                                  pt: "Indicadores DHIS2",
                                })}
                                :
                              </span>
                              <span class="font-mono">
                                {toNum0(keyedNumber)}
                              </span>
                            </div>
                          </div>
                        )}
                      </Show>
                    </div>
                  </Card>
                  <Card
                    onClick={() => setSelectedDatasource("hmis")}
                  >
                    <div class="ui-spy-sm">
                      <div class="font-700 pb-2 text-sm">
                        {t3({ en: "Data", fr: "Données", pt: "Dados" })}
                      </div>
                      <Show
                        when={instanceState.datasetsWithData.includes("hmis")}
                        fallback={
                          <div class="text-danger text-xs">
                            {t3({
                              en: "No data added",
                              fr: "Aucune donnée ajoutée",
                              pt: "Nenhum dado adicionado",
                            })}
                          </div>
                        }
                      >
                        <div class="text-success text-xs">
                          {t3({
                            en: "Has data",
                            fr: "Contient des données",
                            pt: "Contém dados",
                          })}
                        </div>
                      </Show>
                    </div>
                  </Card>
                  <Card
                    onClick={() => setSelectedDatasource("geojson_hmis")}
                  >
                    <div class="ui-spy-sm">
                      <div class="font-700 pb-2 text-sm">
                        {t3({
                          en: "GeoJSON maps",
                          fr: "Cartes GeoJSON",
                          pt: "Mapas GeoJSON",
                        })}
                      </div>
                      <Show
                        when={geojsonLevels("hmis").length > 0}
                        fallback={
                          <div class="text-danger text-xs">
                            {t3({
                              en: "No GeoJSON maps uploaded",
                              fr: "Aucune carte GeoJSON téléchargée",
                              pt: "Nenhum mapa GeoJSON carregado",
                            })}
                          </div>
                        }
                      >
                        <div class="text-success text-xs">
                          {t3({
                            en: "Levels configured",
                            fr: "Niveaux configurés",
                            pt: "Níveis configurados",
                          })}
                          : {geojsonLevels("hmis").join(", ")}
                        </div>
                      </Show>
                    </div>
                  </Card>
                  <Card onClick={() => setSelectedDatasource("population")}>
                    <div class="ui-spy-sm">
                      <div class="font-700 pb-2 text-sm">
                        {t3({
                          en: "Population",
                          fr: "Population",
                          pt: "População",
                        })}
                      </div>
                      <Show
                        when={instanceState.populationCoverage.length > 0}
                        fallback={
                          <div class="text-danger text-xs">
                            {t3({
                              en: "No population figures",
                              fr: "Aucun chiffre de population",
                              pt: "Sem valores de população",
                            })}
                          </div>
                        }
                      >
                        <div class="ui-spy-sm text-success text-xs">
                          <div class="ui-gap flex justify-between">
                            <span>
                              {t3({
                                en: "Population types with figures",
                                fr: "Types de population renseignés",
                                pt: "Tipos de população com valores",
                              })}
                              :
                            </span>
                            <span class="font-mono">
                              {toNum0(
                                new Set(
                                  instanceState.populationCoverage.map((c) =>
                                    c.populationType
                                  ),
                                ).size,
                              )}
                            </span>
                          </div>
                        </div>
                      </Show>
                    </div>
                  </Card>
                </div>
              </div>

              {/* HFA */}
              <div class="ui-spy" data-tour="instance-data-hfa">
                <div class="ui-spy-sm">
                  <div class="font-700 text-lg">
                    {t3({ en: "HFA", fr: "Enquêtes FOSA", pt: "HFA" })}
                  </div>
                  <div class="border-b" />
                </div>
                <div class="ui-gap grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                  <Show when={canConfigureSettings()}>
                    <Card
                      onClick={() => setSelectedDatasource("config_hfa")}
                    >
                      <div class="ui-spy-sm">
                        <div class="font-700 pb-2 text-sm">
                          {t3({
                            en: "Configuration",
                            fr: "Configuration",
                            pt: "Configuração",
                          })}
                        </div>
                        <div class="ui-spy-sm text-success text-xs">
                          <div class="ui-gap flex justify-between">
                            <span>
                              {t3({
                                en: "Admin area depth",
                                fr: "Profondeur des unités administratives",
                                pt: "Profundidade das zonas administrativas",
                              })}
                              :
                            </span>
                            <span class="font-mono">
                              {structureSchemaForFamily("hfa").adminDepth}
                            </span>
                          </div>
                          <div class="ui-gap flex justify-between">
                            <span>
                              {t3({
                                en: "Facility columns",
                                fr: "Colonnes des établissements",
                                pt: "Colunas dos estabelecimentos",
                              })}
                              :
                            </span>
                            <span class="font-mono">
                              {toNum0(enabledColumnCount("hfa"))}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Show>
                  <Card
                    onClick={() => setSelectedDatasource("facilities_hfa")}
                  >
                    <div class="ui-spy-sm">
                      <div class="font-700 pb-2 text-sm">
                        {t3({
                          en: "Facilities",
                          fr: "Établissements",
                          pt: "Estabelecimentos de saúde",
                        })}
                      </div>
                      <Show
                        when={
                          (instanceState.structure?.hfa.facilities ?? 0) > 0 &&
                          instanceState.structure?.hfa.facilities
                        }
                        fallback={
                          <div class="text-danger text-xs">
                            {t3({
                              en: "No facilities imported",
                              fr: "Aucun établissement importé",
                              pt: "Nenhum estabelecimento de saúde importado",
                            })}
                          </div>
                        }
                        keyed
                      >
                        {(keyedCount) => (
                          <div class="ui-spy-sm text-success text-xs">
                            <div class="ui-gap flex justify-between">
                              <span>
                                {t3({
                                  en: "Facilities",
                                  fr: "Établissements",
                                  pt: "Estabelecimentos de saúde",
                                })}
                                :
                              </span>
                              <span class="font-mono">{toNum0(keyedCount)}</span>
                            </div>
                            {/* Admin areas are derived from these rows, so they
                                are reported here rather than as their own card. */}
                            <For
                              each={([2, 3, 4] as const).filter(
                                (level) =>
                                  structureSchemaForFamily("hfa").adminDepth >=
                                    level,
                              )}
                            >
                              {(level) => (
                                <div class="ui-gap flex justify-between">
                                  <span>{t3(getAdminAreaLabel(level))}:</span>
                                  <span class="font-mono">
                                    {toNum0(
                                      instanceState.structure?.hfa[
                                        `adminArea${level}s`
                                      ] ?? 0,
                                    )}
                                  </span>
                                </div>
                              )}
                            </For>
                          </div>
                        )}
                      </Show>
                    </div>
                  </Card>
                  <Card
                    onClick={() => setSelectedDatasource("hfa_time_points")}
                  >
                    <div class="ui-spy-sm">
                      <div class="font-700 pb-2 text-sm">
                        {t3({
                          en: "Time points",
                          fr: "Points temporels",
                          pt: "Pontos temporais",
                        })}
                      </div>
                      <Show
                        when={instanceState.hfaTimePoints.length > 0}
                        fallback={
                          <div class="text-danger text-xs">
                            {t3({
                              en: "No time points (import data to create)",
                              fr: "Aucun point temporel (importer des données pour créer)",
                              pt: "Nenhum ponto temporal (importar dados para criar)",
                            })}
                          </div>
                        }
                      >
                        <div class="ui-spy-sm text-success text-xs">
                          <div class="ui-gap flex justify-between">
                            <span>
                              {t3({
                                en: "Time points",
                                fr: "Points temporels",
                                pt: "Pontos temporais",
                              })}
                              :
                            </span>
                            <span class="font-mono">
                              {toNum0(instanceState.hfaTimePoints.length)}
                            </span>
                          </div>
                        </div>
                      </Show>
                    </div>
                  </Card>
                  <Card
                    onClick={() => setSelectedDatasource("hfa_weights")}
                  >
                    <div class="ui-spy-sm">
                      <div class="font-700 pb-2 text-sm">
                        {t3({
                          en: "Sampling weights",
                          fr: "Pondérations d'échantillonnage",
                          pt: "Pesos de amostragem",
                        })}
                      </div>
                      <Show
                        when={instanceState.hfaWeights.some(
                          (tp) => tp.weightCount > 0,
                        )}
                        fallback={
                          <div class="text-danger text-xs">
                            {t3({
                              en: "No weights imported",
                              fr: "Aucune pondération importée",
                              pt: "Nenhum peso importado",
                            })}
                          </div>
                        }
                      >
                        <div class="ui-spy-sm text-xs">
                          <For each={instanceState.hfaWeights}>
                            {(tp) => (
                              <div
                                class="ui-gap text-success flex justify-between"
                                classList={{
                                  "text-warning":
                                    tp.weightCount > 0 &&
                                    tp.facilitiesWithDataAndWeight <
                                      tp.facilitiesWithData,
                                }}
                              >
                                <span>{tp.timePoint}:</span>
                                <span class="font-mono">
                                  {`${toNum0(tp.facilitiesWithDataAndWeight)}/${toNum0(tp.facilitiesWithData)}`}
                                </span>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  </Card>
                  <Card
                    onClick={() => setSelectedDatasource("hfa_indicators")}
                  >
                    <div class="ui-spy-sm">
                      <div class="font-700 pb-2 text-sm">
                        {t3({
                          en: "Indicators",
                          fr: "Indicateurs",
                          pt: "Indicadores",
                        })}
                      </div>
                      <Show
                        when={
                          instanceState.indicators.hfaIndicators > 0 &&
                          instanceState.indicators.hfaIndicators
                        }
                        fallback={
                          <div class="text-danger text-xs">
                            {t3({
                              en: "No HFA indicators configured",
                              fr: "Aucun indicateur HFA configuré",
                              pt: "Nenhum indicador HFA configurado",
                            })}
                          </div>
                        }
                        keyed
                      >
                        {(keyedNumber) => (
                          <div class="ui-spy-sm text-success text-xs">
                            <div class="ui-gap flex justify-between">
                              <span>
                                {t3({
                                  en: "HFA indicators",
                                  fr: "Indicateurs Enquetes FOSA",
                                  pt: "Indicadores HFA",
                                })}
                                :
                              </span>
                              <span class="font-mono">
                                {toNum0(keyedNumber)}
                              </span>
                            </div>
                          </div>
                        )}
                      </Show>
                    </div>
                  </Card>
                  <Card
                    onClick={() => setSelectedDatasource("hfa")}
                  >
                    <div class="ui-spy-sm">
                      <div class="font-700 pb-2 text-sm">
                        {t3({ en: "Data", fr: "Données", pt: "Dados" })}
                      </div>
                      <Show
                        when={instanceState.datasetsWithData.includes("hfa")}
                        fallback={
                          <div class="text-danger text-xs">
                            {t3({
                              en: "No data added",
                              fr: "Aucune donnée ajoutée",
                              pt: "Nenhum dado adicionado",
                            })}
                          </div>
                        }
                      >
                        <div class="text-success text-xs">
                          {t3({
                            en: "Has data",
                            fr: "Contient des données",
                            pt: "Contém dados",
                          })}
                        </div>
                      </Show>
                    </div>
                  </Card>
                  <Card
                    onClick={() => setSelectedDatasource("geojson_hfa")}
                  >
                    <div class="ui-spy-sm">
                      <div class="font-700 pb-2 text-sm">
                        {t3({
                          en: "GeoJSON maps",
                          fr: "Cartes GeoJSON",
                          pt: "Mapas GeoJSON",
                        })}
                      </div>
                      <Show
                        when={geojsonLevels("hfa").length > 0}
                        fallback={
                          <div class="text-danger text-xs">
                            {t3({
                              en: "No GeoJSON maps uploaded",
                              fr: "Aucune carte GeoJSON téléchargée",
                              pt: "Nenhum mapa GeoJSON carregado",
                            })}
                          </div>
                        }
                      >
                        <div class="text-success text-xs">
                          {t3({
                            en: "Levels configured",
                            fr: "Niveaux configurés",
                            pt: "Níveis configurados",
                          })}
                          : {geojsonLevels("hfa").join(", ")}
                        </div>
                      </Show>
                    </div>
                  </Card>
                </div>
              </div>

              {/* ICEH */}
              <div class="ui-spy" data-tour="instance-data-iceh">
                <div class="ui-spy-sm">
                  <div class="font-700 text-lg">
                    {t3({ en: "ICEH", fr: "ICEH", pt: "ICEH" })}
                  </div>
                  <div class="border-b" />
                </div>
                <div class="ui-gap grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                  <Card
                    onClick={() => setSelectedDatasource("iceh")}
                  >
                    <div class="ui-spy-sm">
                      <div class="font-700 pb-2 text-sm">
                        {t3({
                          en: "Equity data",
                          fr: "Données d'équité",
                          pt: "Dados de equidade",
                        })}
                      </div>
                      <Show
                        when={instanceState.datasetsWithData.includes("iceh")}
                        fallback={
                          <div class="text-danger text-xs">
                            {t3({
                              en: "No data added",
                              fr: "Aucune donnée ajoutée",
                              pt: "Nenhum dado adicionado",
                            })}
                          </div>
                        }
                      >
                        <div class="text-success text-xs">
                          {t3({
                            en: "Has data",
                            fr: "Contient des données",
                            pt: "Contém dados",
                          })}
                        </div>
                      </Show>
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </FrameTop>
      </Match>
    </Switch>
  );
}
