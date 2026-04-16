import { t3 } from "lib";
import {
  FrameTop,
  HeadingBarMainRibbon,
  toNum0,
} from "panther";
import { Match, Show, Switch, createSignal } from "solid-js";
import { HfaIndicatorsManager } from "./hfa_indicators_manager";
import { IndicatorsManager } from "../indicators/indicators_manager";
import { InstanceDatasetHfa } from "../instance_dataset_hfa";
import { InstanceDatasetHmis } from "../instance_dataset_hmis";
import { Structure } from "../structure";
import { GeoJsonManager } from "../instance_geojson/geojson_manager";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  isGlobalAdmin: boolean;
};

export function InstanceData(p: Props) {
  const [selectedDataSource, setSelecteDatasource] = createSignal<
    string | undefined
  >(undefined);

  return (
    <Switch>
      <Match when={selectedDataSource() === "structure"}>
        <Structure
          backToInstance={() => setSelecteDatasource(undefined)}
          isGlobalAdmin={p.isGlobalAdmin}
        />
      </Match>
      <Match when={selectedDataSource() === "hfa_indicators"}>
        <HfaIndicatorsManager
          isGlobalAdmin={p.isGlobalAdmin}
          backToInstance={() => setSelecteDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "indicators"}>
        <IndicatorsManager
          isGlobalAdmin={p.isGlobalAdmin}
          backToInstance={() => setSelecteDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "hmis"} keyed>
        <InstanceDatasetHmis
          backToInstance={() => setSelecteDatasource(undefined)}
          isGlobalAdmin={p.isGlobalAdmin}
        />
      </Match>
      <Match when={selectedDataSource() === "hfa"} keyed>
        <InstanceDatasetHfa
          backToInstance={() => setSelecteDatasource(undefined)}
          isGlobalAdmin={p.isGlobalAdmin}
        />
      </Match>
      <Match when={selectedDataSource() === "geojson"}>
        <GeoJsonManager
          isGlobalAdmin={p.isGlobalAdmin}
          backToInstance={() => setSelecteDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource()} keyed>
        <div class="ui-pad">{t3({ en: "No display component for this dataset", fr: "Aucun composant d'affichage pour ce jeu de données" })}</div>
      </Match>
      <Match when={true}>
        <FrameTop
          panelChildren={
            <HeadingBarMainRibbon heading={t3({ en: "Data", fr: "Données" })} />
          }
        >
          <div class="ui-pad overflow-auto">
            <div class="max-w-5xl space-y-10">
              {/* Structure & maps */}
              <div class="flex gap-6">
                <div class="w-44 shrink-0 pt-3">
                  <div class="font-700 text-base">{t3({ en: "Structure & maps", fr: "Structure et cartes" })}</div>
                </div>
                <div class="flex flex-1 flex-wrap ui-gap">
                  <div
                    class="ui-pad ui-hoverable border-base-300 ui-spy-sm w-[300px] rounded border"
                    onClick={() => setSelecteDatasource("structure")}
                  >
                    <div class="font-700 pb-2">
                      {t3({ en: "Admin areas and facilities", fr: "Unités administratives et établissements" })}
                    </div>
                    <Show
                      when={instanceState.structure}
                      fallback={
                        <div class="text-danger text-xs">
                          {t3({ en: "No admin areas or facilities added", fr: "Aucune unité administrative ou établissement ajouté" })}
                        </div>
                      }
                      keyed
                    >
                      {(keyedStructureNumbers) => (
                        <div class="ui-spy-sm text-success text-xs">
                          <div class="ui-gap flex justify-between">
                            <span>{t3({ en: "Admin area 1s", fr: "Unités administratives 1" })}:</span>
                            <span class="font-mono">
                              {toNum0(keyedStructureNumbers.adminArea1s)}
                            </span>
                          </div>
                          <div class="ui-gap flex justify-between">
                            <span>{t3({ en: "Admin area 2s", fr: "Unités administratives 2" })}:</span>
                            <span class="font-mono">
                              {toNum0(keyedStructureNumbers.adminArea2s)}
                            </span>
                          </div>
                          <Show when={instanceState.maxAdminArea >= 3}>
                            <div class="ui-gap flex justify-between">
                              <span>{t3({ en: "Admin area 3s", fr: "Unités administratives 3" })}:</span>
                              <span class="font-mono">
                                {toNum0(keyedStructureNumbers.adminArea3s)}
                              </span>
                            </div>
                          </Show>
                          <Show when={instanceState.maxAdminArea >= 4}>
                            <div class="ui-gap flex justify-between">
                              <span>{t3({ en: "Admin area 4s", fr: "Unités administratives 4" })}:</span>
                              <span class="font-mono">
                                {toNum0(keyedStructureNumbers.adminArea4s)}
                              </span>
                            </div>
                          </Show>
                          <div class="ui-gap flex justify-between">
                            <span>{t3({ en: "Facilities", fr: "Établissements" })}:</span>
                            <span class="font-mono">
                              {toNum0(keyedStructureNumbers.facilities)}
                            </span>
                          </div>
                        </div>
                      )}
                    </Show>
                  </div>
                  <div
                    class="ui-pad ui-hoverable border-base-300 ui-spy-sm w-[300px] rounded border"
                    onClick={() => setSelecteDatasource("geojson")}
                  >
                    <div class="font-700 pb-2">{t3({ en: "GeoJSON maps", fr: "Cartes GeoJSON" })}</div>
                    <Show
                      when={instanceState.geojsonMaps.length > 0}
                      fallback={
                        <div class="text-danger text-xs">
                          {t3({ en: "No GeoJSON maps uploaded", fr: "Aucune carte GeoJSON téléchargée" })}
                        </div>
                      }
                    >
                      <div class="text-success text-xs">
                        {t3({ en: "Levels configured", fr: "Niveaux configurés" })}:{" "}
                        {instanceState.geojsonMaps.map((g) => g.adminAreaLevel).join(", ")}
                      </div>
                    </Show>
                  </div>
                </div>
              </div>

              {/* HMIS */}
              <div class="flex gap-6">
                <div class="w-44 shrink-0 pt-3">
                  <div class="font-700 text-base">{t3({ en: "HMIS", fr: "SIGS" })}</div>
                </div>
                <div class="flex flex-1 flex-wrap ui-gap">
                  <div
                    class="ui-pad ui-hoverable border-base-300 ui-spy-sm w-[300px] rounded border"
                    onClick={() => setSelecteDatasource("hmis")}
                  >
                    <div class="font-700 pb-2">{t3({ en: "Data", fr: "Données" })}</div>
                    <Show
                      when={instanceState.datasetsWithData.includes("hmis")}
                      fallback={
                        <div class="text-danger text-xs">
                          {t3({ en: "No data added", fr: "Aucune donnée ajoutée" })}
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
                    <div class="font-700 pb-2">{t3({ en: "Indicators", fr: "Indicateurs" })}</div>
                    <Show
                      when={
                        instanceState.indicators.commonIndicators > 0 &&
                        instanceState.indicators.commonIndicators
                      }
                      fallback={
                        <div class="text-danger text-xs">
                          {t3({ en: "No common indicators", fr: "Aucun indicateur commun" })}
                        </div>
                      }
                      keyed
                    >
                      {(keyedNumber) => (
                        <div class="ui-spy-sm text-success text-xs">
                          <div class="flex justify-between gap-4">
                            <span>{t3({ en: "Common indicators", fr: "Indicateurs communs" })}:</span>
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
                          {t3({ en: "No DHIS2 indicators", fr: "Aucun indicateur DHIS2" })}
                        </div>
                      }
                      keyed
                    >
                      {(keyedNumber) => (
                        <div class="ui-spy-sm text-success text-xs">
                          <div class="flex justify-between gap-4">
                            <span>{t3({ en: "DHIS2 indicators", fr: "Indicateurs DHIS2" })}:</span>
                            <span class="font-mono">
                              {toNum0(keyedNumber)}
                            </span>
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
                  <div class="font-700 text-base">{t3({ en: "HFA", fr: "EES" })}</div>
                </div>
                <div class="flex flex-1 flex-wrap ui-gap">
                  <div
                    class="ui-pad ui-hoverable border-base-300 ui-spy-sm w-[300px] rounded border"
                    onClick={() => setSelecteDatasource("hfa")}
                  >
                    <div class="font-700 pb-2">{t3({ en: "Data", fr: "Données" })}</div>
                    <Show
                      when={instanceState.datasetsWithData.includes("hfa")}
                      fallback={
                        <div class="text-danger text-xs">
                          {t3({ en: "No data added", fr: "Aucune donnée ajoutée" })}
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
                    <div class="font-700 pb-2">{t3({ en: "Indicators", fr: "Indicateurs" })}</div>
                    <Show
                      when={
                        instanceState.indicators.hfaIndicators > 0 &&
                        instanceState.indicators.hfaIndicators
                      }
                      fallback={
                        <div class="text-danger text-xs">
                          {t3({ en: "No HFA indicators configured", fr: "Aucun indicateur HFA configuré" })}
                        </div>
                      }
                      keyed
                    >
                      {(keyedNumber) => (
                        <div class="ui-spy-sm text-success text-xs">
                          <div class="flex justify-between gap-4">
                            <span>{t3({ en: "HFA indicators", fr: "Indicateurs EES" })}:</span>
                            <span class="font-mono">{toNum0(keyedNumber)}</span>
                          </div>
                        </div>
                      )}
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
