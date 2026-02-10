import { InstanceDetail, _POSSIBLE_DATASETS, t3 } from "lib";
import {
  Button,
  FrameTop,
  HeadingBarMainRibbon,
  StateHolderWrapper,
  TimQuery,
  toNum0,
} from "panther";
import { For, Match, Show, Switch, createSignal } from "solid-js";
import { IndicatorsManager } from "../indicators/indicators_manager";
import { InstanceDatasetHfa } from "../instance_dataset_hfa";
import { InstanceDatasetHmis } from "../instance_dataset_hmis";
import { Structure } from "../structure";

type Props = {
  isGlobalAdmin: boolean;
  instanceDetail: TimQuery<InstanceDetail>;
};

export function InstanceData(p: Props) {
  // Temp state

  const [selectedDataSource, setSelecteDatasource] = createSignal<
    string | undefined
  >(undefined);

  return (
    <Switch>
      <Match when={selectedDataSource() === "structure"}>
        <Structure
          backToInstance={() => setSelecteDatasource(undefined)}
          instanceDetail={p.instanceDetail}
          isGlobalAdmin={p.isGlobalAdmin}
        />
      </Match>
      <Match when={selectedDataSource() === "indicators"}>
        <IndicatorsManager
          isGlobalAdmin={p.isGlobalAdmin}
          instanceDetail={p.instanceDetail}
          backToInstance={() => setSelecteDatasource(undefined)}
        />
      </Match>
      <Match when={selectedDataSource() === "hmis"} keyed>
        <InstanceDatasetHmis
          instanceDetail={p.instanceDetail}
          backToInstance={() => setSelecteDatasource(undefined)}
          isGlobalAdmin={p.isGlobalAdmin}
        />
      </Match>
      <Match when={selectedDataSource() === "hfa"} keyed>
        <InstanceDatasetHfa
          instanceDetail={p.instanceDetail}
          backToInstance={() => setSelecteDatasource(undefined)}
          isGlobalAdmin={p.isGlobalAdmin}
        />
      </Match>
      <Match when={selectedDataSource()} keyed>
        <div class="ui-pad">{t3({ en: "No display component for this dataset", fr: "Aucun composant d'affichage pour ce jeu de données" })}</div>
      </Match>
      <Match when={true}>
        <FrameTop
          panelChildren={
            <HeadingBarMainRibbon heading={t3({ en: "Data", fr: "Données" })}>
              <Button
                iconName="refresh"
                onClick={() => p.instanceDetail.fetch()}
              />
            </HeadingBarMainRibbon>
          }
        >
          <StateHolderWrapper state={p.instanceDetail.state()}>
            {(keyedInstanceDetail) => {
              return (
                <div class="flex h-full w-full">
                  <div class="ui-pad border-base-300 h-full w-1/2 overflow-auto border-r">
                    <div class="font-700 pb-2 text-lg">
                      {t3({ en: "Common structure", fr: "Structure commune" })}
                    </div>
                    <div class="ui-spy-sm">
                      <div
                        class="ui-pad ui-hoverable bg-base-100 border-base-300 ui-spy-sm block rounded border"
                        onClick={() => setSelecteDatasource("structure")}
                      >
                        <div class="font-700 pb-2">
                          {t3({ en: "Admin areas and facilities", fr: "Unités administratives et établissements" })}
                        </div>
                        <Show
                          when={keyedInstanceDetail.structure}
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
                                <span class="">{t3({ en: "Admin area 1s", fr: "Unités administratives 1" })}:</span>
                                <span class="font-mono">
                                  {toNum0(keyedStructureNumbers.adminArea1s)}
                                </span>
                              </div>
                              <div class="ui-gap flex justify-between">
                                <span class="">{t3({ en: "Admin area 2s", fr: "Unités administratives 2" })}:</span>
                                <span class="font-mono">
                                  {toNum0(keyedStructureNumbers.adminArea2s)}
                                </span>
                              </div>
                              <Show
                                when={keyedInstanceDetail.maxAdminArea >= 3}
                              >
                                <div class="ui-gap flex justify-between">
                                  <span class="">{t3({ en: "Admin area 3s", fr: "Unités administratives 3" })}:</span>
                                  <span class="font-mono">
                                    {toNum0(keyedStructureNumbers.adminArea3s)}
                                  </span>
                                </div>
                              </Show>
                              <Show
                                when={keyedInstanceDetail.maxAdminArea >= 4}
                              >
                                <div class="ui-gap flex justify-between">
                                  <span class="">{t3({ en: "Admin area 4s", fr: "Unités administratives 4" })}:</span>
                                  <span class="font-mono">
                                    {toNum0(keyedStructureNumbers.adminArea4s)}
                                  </span>
                                </div>
                              </Show>
                              <div class="ui-gap flex justify-between">
                                <span class="">{t3({ en: "Facilities", fr: "Établissements" })}:</span>
                                <span class="font-mono">
                                  {toNum0(keyedStructureNumbers.facilities)}
                                </span>
                              </div>
                            </div>
                          )}
                        </Show>
                      </div>
                      <div
                        class="ui-pad ui-hoverable bg-base-100 border-base-300 ui-spy-sm block rounded border"
                        onClick={() => setSelecteDatasource("indicators")}
                      >
                        <div class="font-700 pb-2">{t3({ en: "Indicators", fr: "Indicateurs" })}</div>
                        <Show
                          when={
                            keyedInstanceDetail.indicators.commonIndicators >
                              0 &&
                            keyedInstanceDetail.indicators.commonIndicators
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
                                <span class="">{t3({ en: "Common indicators", fr: "Indicateurs communs" })}:</span>
                                <span class="font-mono">
                                  {toNum0(keyedNumber)}
                                </span>
                              </div>
                            </div>
                          )}
                        </Show>
                        <Show
                          when={
                            keyedInstanceDetail.indicators.rawIndicators > 0 &&
                            keyedInstanceDetail.indicators.rawIndicators
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
                                <span class="">{t3({ en: "DHIS2 indicators", fr: "Indicateurs DHIS2" })}:</span>
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
                  <div class="ui-pad h-full w-1/2 overflow-auto">
                    <div class="font-700 pb-2 text-lg">{t3({ en: "Data sources", fr: "Sources de données" })}</div>
                    <div class="ui-spy-sm">
                      <For each={_POSSIBLE_DATASETS}>
                        {(possibleDataset) => {
                          return (
                            <div
                              class="ui-pad ui-hoverable bg-base-100 border-base-300 ui-spy-sm block rounded border"
                              onClick={() =>
                                setSelecteDatasource(
                                  possibleDataset.datasetType,
                                )
                              }
                            >
                              <div class="font-700 pb-2">
                                {possibleDataset.label}
                              </div>
                              <Show
                                when={keyedInstanceDetail.datasetsWithData.includes(
                                  possibleDataset.datasetType,
                                )}
                                fallback={
                                  <div class="text-danger text-xs">
                                    {t3({ en: "No data added", fr: "Aucune donnée ajoutée" })}
                                  </div>
                                }
                                keyed
                              >
                                {(_keyedVersionId) => (
                                  <div class="text-success text-xs">
                                    {t3({ en: "Has data", fr: "Contient des données" })}
                                  </div>
                                )}
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                </div>
              );
            }}
          </StateHolderWrapper>
        </FrameTop>
      </Match>
    </Switch>
  );
}
