import { t3 } from "lib";
import { FrameTop, HeadingBarMainRibbon, toNum0 } from "panther";
import { For, Match, Show, Switch, createSignal } from "solid-js";
import { HfaIndicatorsManager } from "../indicator_manager_hfa/hfa_indicators_manager";
import { IndicatorsManager } from "../indicator_manager_hmis/indicators_manager";
import { InstanceDatasetHfa } from "../instance_dataset_hfa";
import { InstanceDatasetHmis } from "../instance_dataset_hmis";
import { InstanceDatasetIceh } from "../instance_dataset_iceh";
import { InstanceHfaTimePoints } from "../instance_hfa_time_points";
import { Facilities } from "../structure";
import { AdminAreas } from "../structure/admin_areas";
import { HfaWeights } from "../structure/hfa_weights";
import { GeoJsonManager } from "../instance_geojson/geojson_manager";
import { instanceState } from "~/state/instance/t1_store";
import { getAdminAreaLabel } from "~/state/instance/_util_disaggregation_label";

type Props = {};

export function InstanceData(p: Props) {
  const [selectedDataSource, setSelecteDatasource] = createSignal<
    string | undefined
  >(undefined);

  return (
    <Switch>
      <Match when={selectedDataSource() === "admin_areas"}>
        <AdminAreas backToInstance={() => setSelecteDatasource(undefined)} />
      </Match>
      <Match when={selectedDataSource() === "facilities_hmis"}>
        <Facilities
          family="hmis"
          backToInstance={() => setSelecteDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "facilities_hfa"}>
        <Facilities
          family="hfa"
          backToInstance={() => setSelecteDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "hfa_weights"}>
        <HfaWeights backToInstance={() => setSelecteDatasource(undefined)} />
      </Match>
      <Match when={selectedDataSource() === "hfa_indicators"}>
        <HfaIndicatorsManager
          backToInstance={() => setSelecteDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "indicators"}>
        <IndicatorsManager
          backToInstance={() => setSelecteDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "hmis"} keyed>
        <InstanceDatasetHmis
          backToInstance={() => setSelecteDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "hfa"} keyed>
        <InstanceDatasetHfa
          backToInstance={() => setSelecteDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "iceh"} keyed>
        <InstanceDatasetIceh
          backToInstance={() => setSelecteDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "hfa_time_points"}>
        <InstanceHfaTimePoints
          backToInstance={() => setSelecteDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "geojson"}>
        <GeoJsonManager
          backToInstance={() => setSelecteDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource()} keyed>
        <div class="ui-pad">
          {t3({
            en: "No display component for this dataset",
            fr: "Aucun composant d'affichage pour ce jeu de données",
          })}
        </div>
      </Match>
      <Match when={true}>
        <FrameTop
          panelChildren={
            <HeadingBarMainRibbon heading={t3({ en: "Data", fr: "Données" })} />
          }
        >
          <div class="ui-pad overflow-auto">
            <div class="space-y-14">
              {/* Structure & maps */}
              <div class="flex gap-6">
                <div class="w-44 shrink-0 pt-3">
                  <div class="font-700 text-base">
                    {t3({ en: "Structure & maps", fr: "Structure et cartes" })}
                  </div>
                </div>
                <div class="ui-gap flex flex-1 flex-wrap">
                  <div
                    class="ui-pad ui-hoverable border-base-300 ui-spy-sm w-[300px] rounded border"
                    onClick={() => setSelecteDatasource("admin_areas")}
                  >
                    <div class="font-700 pb-2">
                      {t3({
                        en: "Admin areas",
                        fr: "Unités administratives",
                      })}
                    </div>
                    <Show
                      when={instanceState.structure}
                      fallback={
                        <div class="text-danger text-xs">
                          {t3({
                            en: "No admin areas (created by facility imports)",
                            fr: "Aucune unité administrative (créées par l'importation d'établissements)",
                          })}
                        </div>
                      }
                      keyed
                    >
                      {(keyedStructureNumbers) => (
                        <div class="ui-spy-sm text-success text-xs">
                          <div class="ui-gap flex justify-between">
                            <span>{t3(getAdminAreaLabel(2))}:</span>
                            <span class="font-mono">
                              {toNum0(keyedStructureNumbers.adminArea2s)}
                            </span>
                          </div>
                          <Show when={instanceState.maxAdminArea >= 3}>
                            <div class="ui-gap flex justify-between">
                              <span>{t3(getAdminAreaLabel(3))}:</span>
                              <span class="font-mono">
                                {toNum0(keyedStructureNumbers.adminArea3s)}
                              </span>
                            </div>
                          </Show>
                          <Show when={instanceState.maxAdminArea >= 4}>
                            <div class="ui-gap flex justify-between">
                              <span>{t3(getAdminAreaLabel(4))}:</span>
                              <span class="font-mono">
                                {toNum0(keyedStructureNumbers.adminArea4s)}
                              </span>
                            </div>
                          </Show>
                        </div>
                      )}
                    </Show>
                  </div>
                  <div
                    class="ui-pad ui-hoverable border-base-300 ui-spy-sm w-[300px] rounded border"
                    onClick={() => setSelecteDatasource("geojson")}
                  >
                    <div class="font-700 pb-2">
                      {t3({ en: "GeoJSON maps", fr: "Cartes GeoJSON" })}
                    </div>
                    <Show
                      when={instanceState.geojsonMaps.length > 0}
                      fallback={
                        <div class="text-danger text-xs">
                          {t3({
                            en: "No GeoJSON maps uploaded",
                            fr: "Aucune carte GeoJSON téléchargée",
                          })}
                        </div>
                      }
                    >
                      <div class="text-success text-xs">
                        {t3({
                          en: "Levels configured",
                          fr: "Niveaux configurés",
                        })}
                        :{" "}
                        {instanceState.geojsonMaps
                          .map((g) => g.adminAreaLevel)
                          .join(", ")}
                      </div>
                    </Show>
                  </div>
                </div>
              </div>

              {/* HMIS */}
              <div class="flex gap-6">
                <div class="w-44 shrink-0 pt-3">
                  <div class="font-700 text-base">
                    {t3({ en: "HMIS", fr: "SNIS" })}
                  </div>
                </div>
                <div class="ui-gap flex flex-1 flex-wrap">
                  <div
                    class="ui-pad ui-hoverable border-base-300 ui-spy-sm w-[300px] rounded border"
                    onClick={() => setSelecteDatasource("facilities_hmis")}
                  >
                    <div class="font-700 pb-2">
                      {t3({ en: "Facilities", fr: "Établissements" })}
                    </div>
                    <Show
                      when={
                        (instanceState.structure?.facilitiesHmis ?? 0) > 0 &&
                        instanceState.structure?.facilitiesHmis
                      }
                      fallback={
                        <div class="text-danger text-xs">
                          {t3({
                            en: "No facilities imported",
                            fr: "Aucun établissement importé",
                          })}
                        </div>
                      }
                      keyed
                    >
                      {(keyedCount) => (
                        <div class="text-success ui-gap flex justify-between text-xs">
                          <span>
                            {t3({ en: "Facilities", fr: "Établissements" })}:
                          </span>
                          <span class="font-mono">{toNum0(keyedCount)}</span>
                        </div>
                      )}
                    </Show>
                  </div>
                  <div
                    class="ui-pad ui-hoverable border-base-300 ui-spy-sm w-[300px] rounded border"
                    onClick={() => setSelecteDatasource("hmis")}
                  >
                    <div class="font-700 pb-2">
                      {t3({ en: "Data", fr: "Données" })}
                    </div>
                    <Show
                      when={instanceState.datasetsWithData.includes("hmis")}
                      fallback={
                        <div class="text-danger text-xs">
                          {t3({
                            en: "No data added",
                            fr: "Aucune donnée ajoutée",
                          })}
                        </div>
                      }
                    >
                      <div class="text-success text-xs">
                        {t3({ en: "Has data", fr: "Contient des données" })}
                      </div>
                    </Show>
                  </div>
                  <div
                    class="ui-pad ui-hoverable border-base-300 ui-spy-sm w-[300px] rounded border"
                    onClick={() => setSelecteDatasource("indicators")}
                  >
                    <div class="font-700 pb-2">
                      {t3({ en: "Indicators", fr: "Indicateurs" })}
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
                          })}
                        </div>
                      }
                      keyed
                    >
                      {(keyedNumber) => (
                        <div class="ui-spy-sm text-success text-xs">
                          <div class="flex justify-between gap-4">
                            <span>
                              {t3({
                                en: "Common indicators",
                                fr: "Indicateurs communs",
                              })}
                              :
                            </span>
                            <span class="font-mono">{toNum0(keyedNumber)}</span>
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
                          })}
                        </div>
                      }
                      keyed
                    >
                      {(keyedNumber) => (
                        <div class="ui-spy-sm text-success text-xs">
                          <div class="flex justify-between gap-4">
                            <span>
                              {t3({
                                en: "DHIS2 indicators",
                                fr: "Indicateurs DHIS2",
                              })}
                              :
                            </span>
                            <span class="font-mono">{toNum0(keyedNumber)}</span>
                          </div>
                        </div>
                      )}
                    </Show>
                    <Show
                      when={
                        instanceState.indicators.calculatedIndicators > 0 &&
                        instanceState.indicators.calculatedIndicators
                      }
                      keyed
                    >
                      {(keyedNumber) => (
                        <div class="ui-spy-sm text-success text-xs">
                          <div class="flex justify-between gap-4">
                            <span>
                              {t3({
                                en: "Calculated indicators",
                                fr: "Indicateurs calculés",
                              })}
                              :
                            </span>
                            <span class="font-mono">{toNum0(keyedNumber)}</span>
                          </div>
                        </div>
                      )}
                    </Show>
                  </div>
                </div>
              </div>

              {/* HFA */}
              <div class="flex gap-6">
                <div class="w-44 shrink-0 pt-3">
                  <div class="font-700 text-base">
                    {t3({ en: "HFA", fr: "Enquêtes FOSA" })}
                  </div>
                </div>
                <div class="ui-gap flex flex-1 flex-wrap">
                  <div
                    class="ui-pad ui-hoverable border-base-300 ui-spy-sm w-[300px] rounded border"
                    onClick={() => setSelecteDatasource("facilities_hfa")}
                  >
                    <div class="font-700 pb-2">
                      {t3({ en: "Facilities", fr: "Établissements" })}
                    </div>
                    <Show
                      when={
                        (instanceState.structure?.facilitiesHfa ?? 0) > 0 &&
                        instanceState.structure?.facilitiesHfa
                      }
                      fallback={
                        <div class="text-danger text-xs">
                          {t3({
                            en: "No facilities imported",
                            fr: "Aucun établissement importé",
                          })}
                        </div>
                      }
                      keyed
                    >
                      {(keyedCount) => (
                        <div class="text-success ui-gap flex justify-between text-xs">
                          <span>
                            {t3({ en: "Facilities", fr: "Établissements" })}:
                          </span>
                          <span class="font-mono">{toNum0(keyedCount)}</span>
                        </div>
                      )}
                    </Show>
                  </div>
                  <div
                    class="ui-pad ui-hoverable border-base-300 ui-spy-sm w-[300px] rounded border"
                    onClick={() => setSelecteDatasource("hfa_time_points")}
                  >
                    <div class="font-700 pb-2">
                      {t3({ en: "Time points", fr: "Points temporels" })}
                    </div>
                    <Show
                      when={instanceState.hfaTimePoints.length > 0}
                      fallback={
                        <div class="text-danger text-xs">
                          {t3({
                            en: "No time points (import data to create)",
                            fr: "Aucun point temporel (importer des données pour créer)",
                          })}
                        </div>
                      }
                    >
                      <div class="ui-spy-sm text-success text-xs">
                        <div class="flex justify-between gap-4">
                          <span>
                            {t3({
                              en: "Time points",
                              fr: "Points temporels",
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
                  <div
                    class="ui-pad ui-hoverable border-base-300 ui-spy-sm w-[300px] rounded border"
                    onClick={() => setSelecteDatasource("hfa_weights")}
                  >
                    <div class="font-700 pb-2">
                      {t3({
                        en: "Sampling weights",
                        fr: "Pondérations d'échantillonnage",
                      })}
                    </div>
                    <Show
                      when={instanceState.hfaWeights.some(
                        (tp) => tp.weightCount > 0,
                      )}
                      fallback={
                        <div class="text-neutral text-xs">
                          {t3({
                            en: "No weights imported",
                            fr: "Aucune pondération importée",
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
                  <div
                    class="ui-pad ui-hoverable border-base-300 ui-spy-sm w-[300px] rounded border"
                    onClick={() => setSelecteDatasource("hfa")}
                  >
                    <div class="font-700 pb-2">
                      {t3({ en: "Data", fr: "Données" })}
                    </div>
                    <Show
                      when={instanceState.datasetsWithData.includes("hfa")}
                      fallback={
                        <div class="text-danger text-xs">
                          {t3({
                            en: "No data added",
                            fr: "Aucune donnée ajoutée",
                          })}
                        </div>
                      }
                    >
                      <div class="text-success text-xs">
                        {t3({ en: "Has data", fr: "Contient des données" })}
                      </div>
                    </Show>
                  </div>
                  <div
                    class="ui-pad ui-hoverable border-base-300 ui-spy-sm w-[300px] rounded border"
                    onClick={() => setSelecteDatasource("hfa_indicators")}
                  >
                    <div class="font-700 pb-2">
                      {t3({ en: "Indicators", fr: "Indicateurs" })}
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
                          })}
                        </div>
                      }
                      keyed
                    >
                      {(keyedNumber) => (
                        <div class="ui-spy-sm text-success text-xs">
                          <div class="flex justify-between gap-4">
                            <span>
                              {t3({
                                en: "HFA indicators",
                                fr: "Indicateurs Enquetes FOSA",
                              })}
                              :
                            </span>
                            <span class="font-mono">{toNum0(keyedNumber)}</span>
                          </div>
                        </div>
                      )}
                    </Show>
                  </div>
                </div>
              </div>

              {/* ICEH */}
              <div class="flex gap-6">
                <div class="w-44 shrink-0 pt-3">
                  <div class="font-700 text-base">
                    {t3({ en: "ICEH", fr: "ICEH" })}
                  </div>
                </div>
                <div class="ui-gap flex flex-1 flex-wrap">
                  <div
                    class="ui-pad ui-hoverable border-base-300 ui-spy-sm w-[300px] rounded border"
                    onClick={() => setSelecteDatasource("iceh")}
                  >
                    <div class="font-700 pb-2">
                      {t3({ en: "Equity data", fr: "Données d'équité" })}
                    </div>
                    <Show
                      when={instanceState.datasetsWithData.includes("iceh")}
                      fallback={
                        <div class="text-danger text-xs">
                          {t3({
                            en: "No data added",
                            fr: "Aucune donnée ajoutée",
                          })}
                        </div>
                      }
                    >
                      <div class="text-success text-xs">
                        {t3({ en: "Has data", fr: "Contient des données" })}
                      </div>
                    </Show>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </FrameTop>
      </Match>
    </Switch>
  );
}
