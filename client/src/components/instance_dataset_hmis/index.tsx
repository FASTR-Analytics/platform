import {
  t3,
  type DatasetHmisImportLedgerItem,
  type Dhis2RunPairInput,
  type HmisIndicator,
  type ItemsHolderDatasetHmisDisplay,
} from "lib";
import {
  Badge,
  Button,
  Callout,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  TabsNavigation,
  getEditorWrapper,
  openComponent,
  type ListItem,
  type StateHolder,
} from "panther";
import {
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
} from "solid-js";
import { createStore } from "solid-js/store";
import { serverActions } from "~/server_actions";
import {
  instanceState,
  structureSchemaForFamily,
} from "~/state/instance/t1_store";
import { getDatasetHmisDisplayInfoFromCacheOrFetch } from "~/state/instance/t2_datasets";
import { getIndicatorsFromCacheOrFetch } from "~/state/instance/t2_indicators";
import {
  indicatorsByDataId,
  indicatorNameText,
} from "~/components/data/hmis/_shared/indicator_display";
import { DatasetHmisImports } from "./imports";
import {
  Dhis2Wizard,
  type Dhis2WizardEntry,
  type Dhis2WizardResult,
} from "./imports/_wizard";
import { DeleteData } from "./_delete_data";
import { ImportLedgerIndicatorDetail } from "./_ledger_indicator_detail";
import { LedgerTable, type LedgerPeriodWindow } from "./_ledger_table";
import {
  DatasetDisplayPresentation,
  type VizConfig,
} from "./dataset_items_holder";

type Props = {
  close: (v: undefined) => void;
};

type TabId = "visualization" | "ledger";

const FETCHING_DATA = () =>
  t3({
    en: "Fetching data...",
    fr: "Récupération des données...",
    pt: "A obter dados...",
  });

// The page owns every read and the view state (PLAN_A8 ruling 10): the two
// tab bodies render over it, so a tab switch is never a fetch.
export function InstanceDatasetHmis(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [tab, setTab] = createSignal<TabId>("visualization");

  const [itemsHolder, setItemsHolder] = createSignal<
    StateHolder<ItemsHolderDatasetHmisDisplay>
  >({ status: "loading", msg: FETCHING_DATA() });
  const [vizConfig, setVizConfig] = createStore<VizConfig>({
    value: "count",
    figureType: "line",
    indicators: [],
    heatMapAxis: "month",
  });

  let displayRequestId = 0;
  createEffect(() => {
    const versionId = instanceState.datasetVersions.hmis;
    const countIndicatorsVersion = instanceState.countIndicatorsVersion;
    if (versionId === undefined) {
      return;
    }
    const requestId = ++displayRequestId;
    setItemsHolder({ status: "loading", msg: FETCHING_DATA() });
    void getDatasetHmisDisplayInfoFromCacheOrFetch(
      versionId,
      countIndicatorsVersion,
      structureSchemaForFamily("hmis"),
      instanceState.structureLastUpdated,
      instanceState.hmisImportRunActive,
    ).then((res) => {
      if (requestId !== displayRequestId) {
        return;
      }
      if (res.success === false) {
        setItemsHolder({ status: "error", err: res.err });
        return;
      }
      setVizConfig(
        "indicators",
        res.data.indicators.map((ind) => ind.value),
      );
      setItemsHolder({ status: "ready", data: res.data });
    });
  });

  // The ledger is a full-table read (one row per data id × month): fetched
  // once on mount and again when the data version or the running-run flag
  // changes (PLAN_A8 ruling 7). Stale rows stay visible until fresh ones
  // arrive.
  const [ledger, setLedger] = createSignal<
    StateHolder<DatasetHmisImportLedgerItem[]>
  >({
    status: "loading",
    msg: t3({
      en: "Loading import status...",
      fr: "Chargement de l'état des importations...",
      pt: "A carregar o estado das importações...",
    }),
  });
  createEffect(
    on(
      () => [
        instanceState.datasetVersions.hmis,
        instanceState.hmisImportRunActive,
      ],
      () => {
        const controller = new AbortController();
        onCleanup(() => controller.abort());
        void serverActions.getDatasetHmisImportLedger({}).then((res) => {
          if (controller.signal.aborted) {
            return;
          }
          setLedger(
            res.success
              ? { status: "ready", data: res.data }
              : { status: "error", err: res.err },
          );
        });
      },
    ),
  );

  // The dictionary keyed by data id labels the ledger, a display-only
  // enrichment read through the T2 cache (PLAN_A8 ruling 11).
  const [indicators, setIndicators] = createSignal<HmisIndicator[]>([]);
  let indicatorsRequestId = 0;
  createEffect(() => {
    const version = instanceState.indicatorsVersion;
    if (!version) {
      return;
    }
    const requestId = ++indicatorsRequestId;
    void getIndicatorsFromCacheOrFetch(version).then((res) => {
      if (requestId !== indicatorsRequestId || !res.success) {
        return;
      }
      setIndicators(res.data.indicators);
    });
  });
  const byDataId = createMemo(() => indicatorsByDataId(indicators()));

  const [importNotice, setImportNotice] = createSignal<
    Dhis2WizardResult | undefined
  >(undefined);

  function importNoticeText(result: Dhis2WizardResult): string {
    return result.landedTab === "current"
      ? t3({
          en: "The import has been started. Follow it under Imports, Current.",
          fr: "L'importation a été lancée. Suivez-la sous Importations, En cours.",
          pt: "A importação foi iniciada. Acompanhe-a em Importações, Atual.",
        })
      : t3({
          en: "The import has been scheduled. Follow it under Imports, Future.",
          fr: "L'importation a été planifiée. Suivez-la sous Importations, À venir.",
          pt: "A importação foi agendada. Acompanhe-a em Importações, Futuro.",
        });
  }

  async function openWizard(entry: Dhis2WizardEntry) {
    const res = await openComponent({
      element: Dhis2Wizard,
      props: { entry },
    });
    if (res) {
      setImportNotice(res);
    }
  }

  async function openIndicatorDetail(
    dataId: string,
    items: DatasetHmisImportLedgerItem[],
    periodWindow: LedgerPeriodWindow,
  ) {
    const indicator = byDataId().get(dataId);
    const pairs = await openEditor({
      element: ImportLedgerIndicatorDetail,
      props: { dataId, indicator, items, window: periodWindow },
    });
    if (pairs && pairs.length > 0) {
      await openWizard({
        kind: "presetPairs",
        pairs,
        label: `${t3({
          en: "Re-importing",
          fr: "Réimportation de",
          pt: "A reimportar",
        })} ${indicator ? indicatorNameText(indicator) : dataId}:`,
      });
    }
  }

  async function retryFailedPairs(pairs: Dhis2RunPairInput[]) {
    await openWizard({
      kind: "presetPairs",
      pairs,
      label: t3({
        en: "Retrying all failed pairs:",
        fr: "Nouvelle tentative pour toutes les paires en échec :",
        pt: "Nova tentativa para todos os pares falhados:",
      }),
    });
  }

  async function openImports() {
    await openEditor({ element: DatasetHmisImports, props: {} });
  }

  async function deleteData() {
    const versionId = instanceState.datasetVersions.hmis;
    if (versionId === undefined) {
      return;
    }
    await openEditor({
      element: DeleteData,
      props: {
        hmisVersionId: versionId,
        countIndicatorsVersion: instanceState.countIndicatorsVersion,
        structureSchema: structureSchemaForFamily("hmis"),
      },
    });
  }

  const tabItems: ListItem<TabId>[] = [
    {
      id: "visualization",
      label: t3({
        en: "Visualization",
        fr: "Visualisation",
        pt: "Visualização",
      }),
    },
    {
      id: "ledger",
      label: t3({ en: "Ledger", fr: "Registre", pt: "Registo" }),
    },
  ];

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            onBack={() => p.close(undefined)}
            heading={t3({
              en: "DATASET",
              fr: "JEU DE DONNÉES",
              pt: "CONJUNTO DE DADOS",
            })}
            subheading={t3({
              en: "HMIS Data",
              fr: "Données HMIS",
              pt: "Dados HMIS",
            })}
          >
            <Show when={instanceState.currentUserIsGlobalAdmin}>
              <div class="ui-gap-sm flex items-center">
                <Show when={instanceState.hmisImportRunActive}>
                  <Badge intent="neutral">
                    {t3({
                      en: "Import running",
                      fr: "Importation en cours",
                      pt: "Importação em curso",
                    })}
                  </Badge>
                </Show>
                <Button onClick={openImports} iconName="databaseImport">
                  {t3({
                    en: "Imports",
                    fr: "Importations",
                    pt: "Importações",
                  })}
                </Button>
                <Show when={instanceState.hmisNVersions > 0}>
                  <Button
                    onClick={deleteData}
                    intent="danger"
                    iconName="trash"
                    outline
                  >
                    {t3({
                      en: "Delete data",
                      fr: "Supprimer les données",
                      pt: "Eliminar os dados",
                    })}
                  </Button>
                </Show>
              </div>
            </Show>
          </HeadingBar>
        }
      >
        <div class="flex h-full w-full flex-col">
          <TabsNavigation
            items={tabItems}
            value={tab()}
            onChange={setTab}
            insetRail
          />
          <Show when={importNotice()}>
            {(notice) => (
              <div class="ui-pad flex-none pb-0">
                <Callout intent="success" pad="sm">
                  <div class="ui-gap-sm flex items-center">
                    <div class="flex-1">{importNoticeText(notice())}</div>
                    <Button
                      onClick={() => setImportNotice(undefined)}
                      iconName="x"
                      intent="success"
                      size="sm"
                    />
                  </div>
                </Callout>
              </div>
            )}
          </Show>
          <div class="min-h-0 w-full flex-1">
            <Switch>
              <Match when={tab() === "visualization"}>
                <Show
                  when={instanceState.datasetVersions.hmis !== undefined}
                  fallback={
                    <div class="ui-pad">
                      {t3({
                        en: "No data",
                        fr: "Aucune donnée",
                        pt: "Sem dados",
                      })}
                    </div>
                  }
                >
                  <StateHolderWrapper state={itemsHolder()}>
                    {(keyedDatasetItems) => (
                      <DatasetDisplayPresentation
                        displayItems={keyedDatasetItems}
                        vizConfig={vizConfig}
                        setVizConfig={setVizConfig}
                      />
                    )}
                  </StateHolderWrapper>
                </Show>
              </Match>
              <Match when={tab() === "ledger"}>
                <div class="ui-pad h-full w-full">
                  <LedgerTable
                    ledger={ledger()}
                    indicatorsByDataId={byDataId()}
                    onOpenIndicator={openIndicatorDetail}
                    onRetryFailedPairs={retryFailedPairs}
                  />
                </div>
              </Match>
            </Switch>
          </div>
        </div>
      </FrameTop>
    </EditorWrapper>
  );
}
