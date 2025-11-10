import { InstanceDetail, _POSSIBLE_DATASETS, t, t2, T } from "lib";
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
        <div class="ui-pad">No display component for this dataset</div>
      </Match>
      <Match when={true}>
        <FrameTop
          panelChildren={
            <HeadingBarMainRibbon heading={t2(T.FRENCH_UI_STRINGS.data)}>
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
                      {t2(T.FRENCH_UI_STRINGS.common_structure)}
                    </div>
                    <div class="ui-spy-sm">
                      <div
                        class="ui-pad ui-hoverable bg-base-100 border-base-300 ui-spy-sm block rounded border"
                        onClick={() => setSelecteDatasource("structure")}
                      >
                        <div class="font-700 pb-2">
                          {t("Admin areas and facilities")}
                        </div>
                        <Show
                          when={keyedInstanceDetail.structure}
                          fallback={
                            <div class="text-danger text-xs">
                              {t("No admin areas or facilities added")}
                            </div>
                          }
                          keyed
                        >
                          {(keyedStructureNumbers) => (
                            <div class="ui-spy-sm text-success text-xs">
                              <div class="ui-gap flex justify-between">
                                <span class="">{t("Admin area 1s")}:</span>
                                <span class="font-mono">
                                  {toNum0(keyedStructureNumbers.adminArea1s)}
                                </span>
                              </div>
                              <div class="ui-gap flex justify-between">
                                <span class="">{t("Admin area 2s")}:</span>
                                <span class="font-mono">
                                  {toNum0(keyedStructureNumbers.adminArea2s)}
                                </span>
                              </div>
                              <Show
                                when={keyedInstanceDetail.maxAdminArea >= 3}
                              >
                                <div class="ui-gap flex justify-between">
                                  <span class="">{t("Admin area 3s")}:</span>
                                  <span class="font-mono">
                                    {toNum0(keyedStructureNumbers.adminArea3s)}
                                  </span>
                                </div>
                              </Show>
                              <Show
                                when={keyedInstanceDetail.maxAdminArea >= 4}
                              >
                                <div class="ui-gap flex justify-between">
                                  <span class="">{t("Admin area 4s")}:</span>
                                  <span class="font-mono">
                                    {toNum0(keyedStructureNumbers.adminArea4s)}
                                  </span>
                                </div>
                              </Show>
                              <div class="ui-gap flex justify-between">
                                <span class="">{t("Facilities")}:</span>
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
                        <div class="font-700 pb-2">{t2(T.FRENCH_UI_STRINGS.indicators)}</div>
                        <Show
                          when={
                            keyedInstanceDetail.indicators.commonIndicators >
                              0 &&
                            keyedInstanceDetail.indicators.commonIndicators
                          }
                          fallback={
                            <div class="text-danger text-xs">
                              {t("No common indicators")}
                            </div>
                          }
                          keyed
                        >
                          {(keyedNumber) => (
                            <div class="ui-spy-sm text-success text-xs">
                              <div class="flex justify-between gap-4">
                                <span class="">{t("Common indicators")}:</span>
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
                              {t("No DHIS2 indicators")}
                            </div>
                          }
                          keyed
                        >
                          {(keyedNumber) => (
                            <div class="ui-spy-sm text-success text-xs">
                              <div class="flex justify-between gap-4">
                                <span class="">{t("DHIS2 indicators")}:</span>
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
                    <div class="font-700 pb-2 text-lg">{t2(T.FRENCH_UI_STRINGS.data_sources)}</div>
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
                                    {t2(T.FRENCH_UI_STRINGS.no_data_added)}
                                  </div>
                                }
                                keyed
                              >
                                {(_keyedVersionId) => (
                                  <div class="text-success text-xs">
                                    {t2(T.FRENCH_UI_STRINGS.has_data)}
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
