import {
  ALL_ADMIN_AREA_LEVELS,
  t3,
  type AdminAreaLevel,
  type FacilityFamily,
} from "lib";
import {
  Card,
  FrameTop,
  TabsNavigation,
  openComponent,
  toNum0,
  type EditorComponentProps,
  type ListItem,
} from "panther";
import { HeadingBar } from "panther";
import { For, Match, Show, Switch, type JSX } from "solid-js";
import { Dhis2ManageConnection } from "../_shared/dhis2_credentials/manage_connection";
import { HfaIndicatorsManager } from "./hfa/indicators/mod.ts";
import { IndicatorsManager } from "../indicator_manager_hmis/indicators_manager";
import { InstanceDatasetHfa } from "./hfa/dataset/mod.ts";
import { InstanceDatasetHmis } from "../instance_dataset_hmis";
import { InstanceDatasetIceh } from "../instance_dataset_iceh";
import { InstanceHfaTimePoints } from "../instance_hfa_time_points";
import { Facilities } from "./facilities/mod.ts";
import { FamilyConfiguration } from "./family_configuration";
import { HfaWeights } from "../structure/hfa_weights";
import { GeoJsonManager } from "./geojson/mod.ts";
import { PopulationManager } from "../instance_population/population_manager";
import {
  instanceState,
  maxDepth,
  structureSchemaForFamily,
} from "~/state/instance/t1_store";
import { getAdminAreaLabel } from "~/state/instance/_util_disaggregation_label";
import {
  dataSection,
  openShellEditor,
  setDataSection,
  type DataSection,
} from "~/state/t4_ui";
import { AdminAreaLabels, AiContextForm } from "./general/mod.ts";

type Props = {};

export function InstanceData(p: Props) {
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

  const isAdminAreaLabelSet = (level: AdminAreaLevel) =>
    !!instanceState.adminAreaLabels[`label${level}`];

  const hasCustomAdminAreaLabel = () =>
    ALL_ADMIN_AREA_LEVELS.some((level) => isAdminAreaLabelSet(level));

  const geojsonLevels = (family: FacilityFamily) =>
    instanceState.geojsonMaps
      .filter((g) => g.family === family)
      .map((g) => g.adminAreaLevel);

  // General holds only the settings cards, so it is offered only to users
  // who can open them; the other sections always have a dataset card.
  const sectionItems = (): ListItem<DataSection>[] => {
    const items: ListItem<DataSection>[] = [];
    if (canConfigureSettings()) {
      items.push({
        id: "general",
        label: t3({ en: "General", fr: "Général", pt: "Geral" }),
      });
    }
    items.push(
      { id: "hmis", label: t3({ en: "HMIS", fr: "SNIS", pt: "HMIS" }) },
      { id: "hfa", label: t3({ en: "HFA", fr: "Enquêtes FOSA", pt: "HFA" }) },
      { id: "iceh", label: t3({ en: "ICEH", fr: "ICEH", pt: "ICEH" }) },
    );
    return items;
  };
  const activeSection = (): DataSection =>
    sectionItems().some((i) => i.id === dataSection())
      ? dataSection()
      : sectionItems()[0].id;

  async function openAiContext() {
    await openComponent({ element: AiContextForm, props: {} });
  }

  async function openDhis2Credentials() {
    await openComponent({ element: Dhis2ManageConnection, props: {} });
  }

  // Every card is a full-page view over the shell; its Back closes it. The
  // const type parameter keeps a family literal from widening to string.
  function openSubPage<const TProps>(
    element: (p: EditorComponentProps<TProps, undefined>) => JSX.Element,
    props: TProps,
  ) {
    void openShellEditor({ element, props });
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading={t3({ en: "Data", fr: "Données", pt: "Dados" })} />
      }
    >
      <FrameTop
        panelChildren={
          <TabsNavigation
            data-tour="instance-data-tabs"
            items={sectionItems()}
            value={activeSection()}
            onChange={setDataSection}
            insetRail
          />
        }
      >
        <div class="ui-pad">
          <Switch>
            <Match when={activeSection() === "general"}>
              <div class="ui-gap grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                <Show when={canConfigureSettings()}>
                  <Card onClick={() => openSubPage(AdminAreaLabels, {})}>
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
                            each={ALL_ADMIN_AREA_LEVELS.filter(
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
                <Show when={canConfigureSettings()}>
                  <Card onClick={openAiContext}>
                    <div class="ui-spy-sm">
                      <div class="font-700 pb-2 text-sm">
                        {t3({
                          en: "AI context",
                          fr: "Contexte IA",
                          pt: "Contexto de IA",
                        })}
                      </div>
                      <Show
                        when={instanceState.aiContext.trim()}
                        fallback={
                          <div class="text-base-content-muted text-xs">
                            {t3({
                              en: "Not set",
                              fr: "Non défini",
                              pt: "Não definido",
                            })}
                          </div>
                        }
                      >
                        <div class="text-success line-clamp-4 text-xs">
                          {instanceState.aiContext}
                        </div>
                      </Show>
                    </div>
                  </Card>
                </Show>
              </div>
            </Match>

            <Match when={activeSection() === "hmis"}>
              <div
                class="ui-gap grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))]"
                data-tour="instance-data-hmis"
              >
                <Show when={canConfigureSettings()}>
                  <Card
                    onClick={() =>
                      openSubPage(FamilyConfiguration, { family: "hmis" })
                    }
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
                              {t3({
                                en: "Server",
                                fr: "Serveur",
                                pt: "Servidor",
                              })}
                              :
                            </span>
                            <span class="truncate">{url}</span>
                          </div>
                        )}
                      </Show>
                    </div>
                  </Card>
                </Show>
                <Card
                  onClick={() => openSubPage(Facilities, { family: "hmis" })}
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
                            each={ALL_ADMIN_AREA_LEVELS.filter(
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
                <Card onClick={() => openSubPage(IndicatorsManager, {})}>
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
                        instanceState.indicators.hmisIndicators > 0 &&
                        instanceState.indicators.hmisIndicators
                      }
                      fallback={
                        <div class="text-danger text-xs">
                          {t3({
                            en: "No indicators",
                            fr: "Aucun indicateur",
                            pt: "Nenhum indicador",
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
                                en: "Indicators",
                                fr: "Indicateurs",
                                pt: "Indicadores",
                              })}
                              :
                            </span>
                            <span class="font-mono">{toNum0(keyedNumber)}</span>
                          </div>
                        </div>
                      )}
                    </Show>
                  </div>
                </Card>
                <Card onClick={() => openSubPage(InstanceDatasetHmis, {})}>
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
                  onClick={() =>
                    openSubPage(GeoJsonManager, { family: "hmis" })
                  }
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
                <Card onClick={() => openSubPage(PopulationManager, {})}>
                  <div class="ui-spy-sm">
                    <div class="font-700 pb-2 text-sm">
                      {t3({
                        en: "Population",
                        fr: "Population",
                        pt: "População",
                      })}
                    </div>
                    <Show
                      when={
                        instanceState.populationRowCount > 0
                          ? instanceState.populationLevel
                          : undefined
                      }
                      keyed
                      fallback={
                        <div class="text-base-content-muted text-xs">
                          {instanceState.populationLevel === undefined
                            ? t3({
                                en: "No population level set",
                                fr: "Aucun niveau de population défini",
                                pt: "Nenhum nível de população definido",
                              })
                            : t3({
                                en: "No population data",
                                fr: "Aucune donnée de população",
                                pt: "Sem dados de população",
                              })}
                        </div>
                      }
                    >
                      {(level) => (
                        <div class="ui-spy-sm text-success text-xs">
                          <div class="ui-gap flex justify-between">
                            <span>
                              {t3({
                                en: "Population level",
                                fr: "Niveau de population",
                                pt: "Nível de população",
                              })}
                              :
                            </span>
                            <span>{t3(getAdminAreaLabel(level))}</span>
                          </div>
                          <div class="ui-gap flex justify-between">
                            <span>
                              {t3({
                                en: "Population types with data",
                                fr: "Types de population renseignés",
                                pt: "Tipos de população com dados",
                              })}
                              :
                            </span>
                            <span class="font-mono">
                              {toNum0(instanceState.populationCoverage.length)}
                            </span>
                          </div>
                        </div>
                      )}
                    </Show>
                  </div>
                </Card>
              </div>
            </Match>

            <Match when={activeSection() === "hfa"}>
              <div
                class="ui-gap grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))]"
                data-tour="instance-data-hfa"
              >
                <Show when={canConfigureSettings()}>
                  <Card
                    onClick={() =>
                      openSubPage(FamilyConfiguration, { family: "hfa" })
                    }
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
                  onClick={() => openSubPage(Facilities, { family: "hfa" })}
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
                            each={ALL_ADMIN_AREA_LEVELS.filter(
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
                <Card onClick={() => openSubPage(InstanceHfaTimePoints, {})}>
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
                <Card onClick={() => openSubPage(HfaWeights, {})}>
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
                <Card onClick={() => openSubPage(HfaIndicatorsManager, {})}>
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
                            <span class="font-mono">{toNum0(keyedNumber)}</span>
                          </div>
                        </div>
                      )}
                    </Show>
                  </div>
                </Card>
                <Card onClick={() => openSubPage(InstanceDatasetHfa, {})}>
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
                  onClick={() => openSubPage(GeoJsonManager, { family: "hfa" })}
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
            </Match>

            <Match when={activeSection() === "iceh"}>
              <div
                class="ui-gap grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))]"
                data-tour="instance-data-iceh"
              >
                <Card onClick={() => openSubPage(InstanceDatasetIceh, {})}>
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
            </Match>
          </Switch>
        </div>
      </FrameTop>
    </FrameTop>
  );
}
