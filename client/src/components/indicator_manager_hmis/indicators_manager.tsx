import {
  t3,
  TC,
  type CommonIndicatorWithMappings,
  type InstanceIndicatorDetails,
  type RawIndicatorWithMappings,
  type CalculatedIndicator,
  type Dhis2RunCredentialsSource,
} from "lib";
import {
  Button,
  FrameLeft,
  FrameRight,
  FrameTop,
  getQueryStateFromApiResponse,
  StateHolderWrapper,
  Table,
  TableColumn,
  TabsNavigation,
  getEditorWrapper,
  openComponent,
  createDeleteAction,
  type BulkAction,
  type ListItem,
  type StateHolder,
} from "panther";
import { Show, createEffect, createMemo, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import {
  getIndicatorsFromCacheOrFetch,
  getCalculatedIndicatorsFromCacheOrFetch,
} from "~/state/instance/t2_indicators";
import { Dhis2CredentialsForm } from "../forms_editors/dhis2_credentials_form";
import { EditIndicatorCommonForm } from "./_edit_indicator_common";
import { EditIndicatorRawForm } from "./_edit_indicator_raw";
import { BatchUploadForm } from "./batch_upload_form";
import { Dhis2IndicatorSelectForm } from "./dhis2_indicator_select_form";
import { CalculatedIndicatorsTable } from "./calculated_indicators_table";

type Props = {
  backToInstance: () => void;
};

export function IndicatorsManager(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [indicators, setIndicators] = createSignal<
    StateHolder<InstanceIndicatorDetails>
  >({
    status: "loading",
    msg: t3({
      en: "Loading indicators...",
      fr: "Chargement des indicateurs...",
      pt: "A carregar os indicadores...",
    }),
  });

  const [calculatedIndicators, setCalculatedIndicators] = createSignal<
    StateHolder<CalculatedIndicator[]>
  >({
    status: "loading",
    msg: t3({
      en: "Loading calculated indicators...",
      fr: "Chargement des indicateurs calculés...",
      pt: "A carregar os indicadores calculados...",
    }),
  });

  const [tab, setTab] = createSignal<"common" | "raw" | "calculated">("common");
  const tabItems: ListItem<"common" | "raw" | "calculated">[] = [
    {
      id: "common",
      label: t3({ en: "Common Indicators", fr: "Indicateurs communs", pt: "Indicadores comuns" }),
    },
    {
      id: "raw",
      label: t3({ en: "Raw DHIS2 Indicators", fr: "Indicateurs DHIS2", pt: "Indicadores DHIS2" }),
    },
    {
      id: "calculated",
      label: t3({ en: "Calculated indicators", fr: "Indicateurs calculés", pt: "Indicadores calculados" }),
    },
  ];

  let indicatorsRequestId = 0;
  createEffect(async () => {
    const version = instanceState.indicatorMappingsVersion;
    if (!version) {
      return;
    }
    const requestId = ++indicatorsRequestId;
    setIndicators({ status: "loading" });
    const res = await getIndicatorsFromCacheOrFetch(version);
    if (requestId !== indicatorsRequestId) {
      return;
    }
    setIndicators(getQueryStateFromApiResponse(res));
  });

  let calculatedIndicatorsRequestId = 0;
  createEffect(async () => {
    const version = instanceState.calculatedIndicatorsVersion;
    if (!version) {
      return;
    }
    const requestId = ++calculatedIndicatorsRequestId;
    setCalculatedIndicators({ status: "loading" });
    const res = await getCalculatedIndicatorsFromCacheOrFetch(version);
    if (requestId !== calculatedIndicatorsRequestId) {
      return;
    }
    setCalculatedIndicators(getQueryStateFromApiResponse(res));
  });

  function handleDownloadCommonCsv(
    commonIndicators: CommonIndicatorWithMappings[],
  ) {
    const headers = [
      "indicator_common_id",
      "indicator_common_label",
      "mapped_raw_indicator_ids",
    ];
    const rows = commonIndicators.map((indicator) => [
      indicator.indicator_common_id,
      indicator.indicator_common_label,
      indicator.raw_indicator_ids.join(","),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row: string[]) =>
        row.map((cell: string) => `"${cell.replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "indicators_common.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadRawCsv(rawIndicators: RawIndicatorWithMappings[]) {
    const headers = ["raw_indicator_id", "raw_indicator_label"];
    const rows = rawIndicators.map((indicator) => [
      indicator.raw_indicator_id,
      indicator.raw_indicator_label,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row: string[]) =>
        row.map((cell: string) => `"${cell.replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "indicators_raw.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleBatchUpload() {
    await openEditor({
      element: BatchUploadForm,
      props: {},
    });
  }

  async function handleDhis2IndicatorSelect() {
    const infoRes = await serverActions.getInstanceDhis2CredentialsInfo({});
    let credentialsSource: Dhis2RunCredentialsSource;
    if (infoRes.success && infoRes.data.storedCredentials) {
      credentialsSource = { kind: "stored" };
    } else {
      const result = await openComponent({
        element: Dhis2CredentialsForm,
        props: {},
      });
      if (!result) {
        return;
      }
      credentialsSource = { kind: "inline", credentials: result.credentials };
    }

    await openEditor({
      element: Dhis2IndicatorSelectForm,
      props: { credentialsSource },
    });
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
            <Button iconName="chevronLeft" onClick={p.backToInstance} />
            <div class="font-700 flex-1 truncate text-xl">
              {t3({ en: "HMIS INDICATORS", fr: "INDICATEURS", pt: "INDICADORES" })}
            </div>
            <div class="ui-gap-sm flex items-center">
              <Show when={instanceState.currentUserIsGlobalAdmin}>
                <Button iconName="upload" onClick={handleBatchUpload}>
                  {t3({
                    en: "Batch import from CSV",
                    fr: "Importation groupée depuis CSV",
                    pt: "Importação em lote a partir de CSV",
                  })}
                </Button>
              </Show>
            </div>
          </div>
        }
      >
        <FrameTop
          panelChildren={
            <TabsNavigation items={tabItems} value={tab()} onChange={setTab} />
          }
        >
          <div class="ui-pad ui-spy h-full w-full overflow-auto">
            <Show when={tab() === "common"}>
              <StateHolderWrapper state={indicators()} noPad>
                {(keyedIndicators) => (
                  <div class="h-full">
                    <CommonIndicatorsTable
                      commonIndicators={keyedIndicators.commonIndicators}
                      rawIndicators={keyedIndicators.rawIndicators}
                      handleDownloadCsv={handleDownloadCommonCsv}
                    />
                  </div>
                )}
              </StateHolderWrapper>
            </Show>
            <Show when={tab() === "raw"}>
              <StateHolderWrapper state={indicators()} noPad>
                {(keyedIndicators) => (
                  <div class="h-full">
                    <RawIndicatorsTable
                      commonIndicators={keyedIndicators.commonIndicators}
                      rawIndicators={keyedIndicators.rawIndicators}
                      handleDhis2IndicatorSelect={handleDhis2IndicatorSelect}
                      handleDownloadCsv={handleDownloadRawCsv}
                    />
                  </div>
                )}
              </StateHolderWrapper>
            </Show>
            <Show when={tab() === "calculated"}>
              <StateHolderWrapper state={indicators()} noPad>
                {(keyedIndicators) => (
                  <StateHolderWrapper state={calculatedIndicators()} noPad>
                    {(calculatedList) => (
                      <div class="h-full">
                        <CalculatedIndicatorsTable
                          calculatedIndicators={calculatedList}
                          commonIndicators={keyedIndicators.commonIndicators}
                        />
                      </div>
                    )}
                  </StateHolderWrapper>
                )}
              </StateHolderWrapper>
            </Show>
          </div>
        </FrameTop>
      </FrameTop>
    </EditorWrapper>
  );
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//   ______                                                                   __                  __  __                        __                                    //
//  /      \                                                                 /  |                /  |/  |                      /  |                                   //
// /$$$$$$  |  ______   _____  ____   _____  ____    ______   _______        $$/  _______    ____$$ |$$/   _______   ______   _$$ |_     ______    ______    _______  //
// $$ |  $$/  /      \ /     \/    \ /     \/    \  /      \ /       \       /  |/       \  /    $$ |/  | /       | /      \ / $$   |   /      \  /      \  /       | //
// $$ |      /$$$$$$  |$$$$$$ $$$$  |$$$$$$ $$$$  |/$$$$$$  |$$$$$$$  |      $$ |$$$$$$$  |/$$$$$$$ |$$ |/$$$$$$$/  $$$$$$  |$$$$$$/   /$$$$$$  |/$$$$$$  |/$$$$$$$/  //
// $$ |   __ $$ |  $$ |$$ | $$ | $$ |$$ | $$ | $$ |$$ |  $$ |$$ |  $$ |      $$ |$$ |  $$ |$$ |  $$ |$$ |$$ |       /    $$ |  $$ | __ $$ |  $$ |$$ |  $$/ $$      \  //
// $$ \__/  |$$ \__$$ |$$ | $$ | $$ |$$ | $$ | $$ |$$ \__$$ |$$ |  $$ |      $$ |$$ |  $$ |$$ \__$$ |$$ |$$ \_____ /$$$$$$$ |  $$ |/  |$$ \__$$ |$$ |       $$$$$$  | //
// $$    $$/ $$    $$/ $$ | $$ | $$ |$$ | $$ | $$ |$$    $$/ $$ |  $$ |      $$ |$$ |  $$ |$$    $$ |$$ |$$       |$$    $$ |  $$  $$/ $$    $$/ $$ |      /     $$/  //
//  $$$$$$/   $$$$$$/  $$/  $$/  $$/ $$/  $$/  $$/  $$$$$$/  $$/   $$/       $$/ $$/   $$/  $$$$$$$/ $$/  $$$$$$$/  $$$$$$$/    $$$$/   $$$$$$/  $$/       $$$$$$$/   //
//                                                                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function CommonIndicatorsTable(p: {
  commonIndicators: CommonIndicatorWithMappings[];
  rawIndicators: RawIndicatorWithMappings[];
  handleDownloadCsv: (commonIndicators: CommonIndicatorWithMappings[]) => void;
}) {
  async function handleCreateIndicator() {
    const _res = await openComponent({
      element: EditIndicatorCommonForm,
      props: {
        rawIndicators: p.rawIndicators,
      },
    });
  }

  async function handleUpdateIndicator(indicator: CommonIndicatorWithMappings) {
    const _res = await openComponent({
      element: EditIndicatorCommonForm,
      props: {
        rawIndicators: p.rawIndicators,
        existingCommonIndicator: indicator,
      },
    });
  }

  async function handleDeleteIndicator(indicator: CommonIndicatorWithMappings) {
    const deleteAction = createDeleteAction(
      {
        text: t3({
          en: "Are you sure you want to delete this indicator?",
          fr: "Êtes-vous sûr de vouloir supprimer cet indicateur ?",
          pt: "Tem a certeza de que pretende eliminar este indicador?",
        }),
        itemList: [indicator.indicator_common_id],
      },
      () =>
        serverActions.deleteCommonIndicators({
          indicator_common_ids: [indicator.indicator_common_id],
        }),
    );

    await deleteAction.click();
  }

  async function handleBulkDeleteIndicators(
    selectedIndicators: CommonIndicatorWithMappings[],
  ) {
    const indicatorIds = selectedIndicators.map(
      (indicator) => indicator.indicator_common_id,
    );
    const indicatorLabels = selectedIndicators.map(
      (indicator) =>
        `${indicator.indicator_common_id} ~ ${indicator.indicator_common_label}`,
    );
    const indicatorCount = indicatorIds.length;
    const deleteAction = createDeleteAction(
      {
        text:
          indicatorCount === 1
            ? t3({
                en: "Are you sure you want to delete this indicator?",
                fr: "Êtes-vous sûr de vouloir supprimer cet indicateur ?",
                pt: "Tem a certeza de que pretende eliminar este indicador?",
              })
            : t3({
                en: "Are you sure you want to delete these indicators?",
                fr: "Êtes-vous sûr de vouloir supprimer ces indicateurs ?",
                pt: "Tem a certeza de que pretende eliminar estes indicadores?",
              }),
        itemList: indicatorLabels,
      },
      () =>
        serverActions.deleteCommonIndicators({
          indicator_common_ids: indicatorIds,
        }),
    );

    await deleteAction.click();
  }

  const columns: TableColumn<CommonIndicatorWithMappings>[] = [
    {
      key: "indicator_common_id",
      header: t3({
        en: "Common Indicator ID",
        fr: "ID de l'indicateur commun",
        pt: "ID do indicador comum",
      }),
      sortable: true,
      render: (indicator) => (
        <span class="font-mono">{indicator.indicator_common_id}</span>
      ),
    },
    {
      key: "indicator_common_label",
      header: t3(TC.label),
      sortable: true,
    },
    {
      key: "is_default",
      header: t3({ en: "Default", fr: "Par défaut", pt: "Predefinição" }),
      sortable: true,
      render: (indicator) => (
        <span class="">{indicator.is_default ? "✓" : ""}</span>
      ),
    },
    {
      key: "raw_indicator_ids",
      header: t3({ en: "Mapped To", fr: "Associé à", pt: "Associado a" }),
      sortable: true,
      render: (indicator) => (
        <div class="font-mono">{indicator.raw_indicator_ids.join(", ")}</div>
      ),
    },
  ];

  const allColumns = createMemo<TableColumn<CommonIndicatorWithMappings>[]>(() => {
    if (!instanceState.currentUserIsGlobalAdmin) return columns;
    return [
      ...columns,
      {
        key: "actions",
        header: "",
        alignH: "right",
        render: (indicator) => (
          <div class="ui-gap-sm flex justify-end">
            <Button
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                handleUpdateIndicator(indicator);
              }}
              iconName="pencil"
              intent="base-100"
            />
            <Button
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                handleDeleteIndicator(indicator);
              }}
              iconName="trash"
              intent="base-100"
            />
          </div>
        ),
      },
    ];
  });

  const bulkActions = createMemo<BulkAction<CommonIndicatorWithMappings>[]>(() =>
    instanceState.currentUserIsGlobalAdmin
      ? [
          {
            label: t3(TC.delete),
            intent: "danger",
            outline: true,
            onClick: handleBulkDeleteIndicators,
          },
        ]
      : [],
  );

  return (
    <div class="flex h-full flex-col">
      <div class="ui-gap-sm flex items-center pb-4">
        <div class="font-700 flex-1 text-xl">
          {t3({ en: "Common Indicators", fr: "Indicateurs communs", pt: "Indicadores comuns" })}
        </div>
        <Show when={instanceState.currentUserIsGlobalAdmin}>
          <Button
            onClick={() => p.handleDownloadCsv(p.commonIndicators)}
            iconName="download"
            intent="neutral"
          >
            {t3({ en: "Download CSV", fr: "Télécharger le CSV", pt: "Transferir o CSV" })}
          </Button>
          <Button
            onClick={handleCreateIndicator}
            iconName="plus"
            intent="primary"
          >
            {t3({
              en: "Create Common Indicator",
              fr: "Créer un indicateur commun",
              pt: "Criar indicador comum",
            })}
          </Button>
        </Show>
      </div>
      <div class="h-0 w-full flex-1">
        <Table
          data={p.commonIndicators}
          columns={allColumns()}
          keyField="indicator_common_id"
          noRowsMessage={t3({
            en: "No common indicators",
            fr: "Aucun indicateur commun",
            pt: "Nenhum indicador comum",
          })}
          bulkActions={bulkActions()}
          selectionLabel={t3({ en: "indicator", fr: "indicateur", pt: "indicador" })}
          fitTableToAvailableHeight
        />
      </div>
    </div>
  );
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  _______                                 __                  __  __                        __                                    //
// /       \                               /  |                /  |/  |                      /  |                                   //
// $$$$$$$  |  ______   __   __   __       $$/  _______    ____$$ |$$/   _______   ______   _$$ |_     ______    ______    _______  //
// $$ |__$$ | /      \ /  | /  | /  |      /  |/       \  /    $$ |/  | /       | /      \ / $$   |   /      \  /      \  /       | //
// $$    $$<  $$$$$$  |$$ | $$ | $$ |      $$ |$$$$$$$  |/$$$$$$$ |$$ |/$$$$$$$/  $$$$$$  |$$$$$$/   /$$$$$$  |/$$$$$$  |/$$$$$$$/  //
// $$$$$$$  | /    $$ |$$ | $$ | $$ |      $$ |$$ |  $$ |$$ |  $$ |$$ |$$ |       /    $$ |  $$ | __ $$ |  $$ |$$ |  $$/ $$      \  //
// $$ |  $$ |/$$$$$$$ |$$ \_$$ \_$$ |      $$ |$$ |  $$ |$$ \__$$ |$$ |$$ \_____ /$$$$$$$ |  $$ |/  |$$ \__$$ |$$ |       $$$$$$  | //
// $$ |  $$ |$$    $$ |$$   $$   $$/       $$ |$$ |  $$ |$$    $$ |$$ |$$       |$$    $$ |  $$  $$/ $$    $$/ $$ |      /     $$/  //
// $$/   $$/  $$$$$$$/  $$$$$/$$$$/        $$/ $$/   $$/  $$$$$$$/ $$/  $$$$$$$/  $$$$$$$/    $$$$/   $$$$$$/  $$/       $$$$$$$/   //
//                                                                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function RawIndicatorsTable(p: {
  commonIndicators: CommonIndicatorWithMappings[];
  rawIndicators: RawIndicatorWithMappings[];
  handleDhis2IndicatorSelect: () => Promise<void>;
  handleDownloadCsv: (rawIndicators: RawIndicatorWithMappings[]) => void;
}) {
  async function handleCreateMapping() {
    const _res = await openComponent({
      element: EditIndicatorRawForm,
      props: {
        commonIndicators: p.commonIndicators,
      },
    });
  }

  async function handleUpdateMapping(indicator: RawIndicatorWithMappings) {
    const _res = await openComponent({
      element: EditIndicatorRawForm,
      props: {
        commonIndicators: p.commonIndicators,
        existingRawIndicator: indicator,
      },
    });
  }

  async function handleDeleteMapping(indicator: RawIndicatorWithMappings) {
    const deleteAction = createDeleteAction(
      {
        text: t3({
          en: "Are you sure you want to delete this indicator?",
          fr: "Êtes-vous sûr de vouloir supprimer cet indicateur ?",
          pt: "Tem a certeza de que pretende eliminar este indicador?",
        }),
        itemList: [indicator.raw_indicator_id],
      },
      () =>
        serverActions.deleteRawIndicators({
          indicator_raw_ids: [indicator.raw_indicator_id],
        }),
    );

    await deleteAction.click();
  }

  async function handleBulkDeleteRawIndicators(
    selectedIndicators: RawIndicatorWithMappings[],
  ) {
    const indicatorIds = selectedIndicators.map(
      (indicator) => indicator.raw_indicator_id,
    );
    const indicatorLabels = selectedIndicators.map(
      (indicator) =>
        `${indicator.raw_indicator_id} ~ ${indicator.raw_indicator_label}`,
    );
    const indicatorCount = indicatorIds.length;
    const deleteAction = createDeleteAction(
      {
        text:
          indicatorCount === 1
            ? t3({
                en: "Are you sure you want to delete this indicator?",
                fr: "Êtes-vous sûr de vouloir supprimer cet indicateur ?",
                pt: "Tem a certeza de que pretende eliminar este indicador?",
              })
            : t3({
                en: "Are you sure you want to delete these indicators?",
                fr: "Êtes-vous sûr de vouloir supprimer ces indicateurs ?",
                pt: "Tem a certeza de que pretende eliminar estes indicadores?",
              }),
        itemList: indicatorLabels,
      },
      () =>
        serverActions.deleteRawIndicators({ indicator_raw_ids: indicatorIds }),
    );

    await deleteAction.click();
  }

  const columns: TableColumn<RawIndicatorWithMappings>[] = [
    {
      key: "raw_indicator_id",
      header: t3({ en: "DHIS2 Indicator ID", fr: "ID de l'indicateur DHIS2", pt: "ID do indicador DHIS2" }),
      sortable: true,
      render: (mapping) => (
        <span class="font-mono">{mapping.raw_indicator_id}</span>
      ),
    },
    {
      key: "raw_indicator_label",
      header: t3(TC.label),
      sortable: true,
    },
    {
      key: "indicator_common_ids",
      header: t3({ en: "Mapped To", fr: "Associé à", pt: "Associado a" }),
      sortable: true,
      render: (mapping) => (
        <span class="font-mono">{mapping.indicator_common_ids.join(", ")}</span>
      ),
    },
  ];

  const allColumns = createMemo<TableColumn<RawIndicatorWithMappings>[]>(() => {
    if (!instanceState.currentUserIsGlobalAdmin) return columns;
    return [
      ...columns,
      {
        key: "actions",
        header: "",
        alignH: "right",
        render: (mapping) => {
          return (
            <div class="ui-gap-sm flex justify-end">
              <Button
                onClick={(e: MouseEvent) => {
                  e.stopPropagation();
                  handleUpdateMapping(mapping);
                }}
                iconName="pencil"
                intent="base-100"
              />
              <Button
                onClick={(e: MouseEvent) => {
                  e.stopPropagation();
                  handleDeleteMapping(mapping);
                }}
                iconName="trash"
                intent="base-100"
              />
            </div>
          );
        },
      },
    ];
  });

  const bulkActions = createMemo<BulkAction<RawIndicatorWithMappings>[]>(() =>
    instanceState.currentUserIsGlobalAdmin
      ? [
          {
            label: t3(TC.delete),
            intent: "danger",
            outline: true,
            onClick: handleBulkDeleteRawIndicators,
          },
        ]
      : [],
  );

  return (
    <div class="flex h-full flex-col">
      <div class="ui-gap-sm flex flex-none items-center pb-4">
        <div class="font-700 flex-1 text-xl">
          {t3({
            en: "DHIS2 Indicators (JSON IDs)",
            fr: "Indicateurs DHIS2 (ID JSON)",
            pt: "Indicadores DHIS2 (ID JSON)",
          })}
        </div>
        <Show when={instanceState.currentUserIsGlobalAdmin}>
          <Button
            onClick={() => p.handleDownloadCsv(p.rawIndicators)}
            iconName="download"
            intent="neutral"
          >
            {t3({ en: "Download CSV", fr: "Télécharger le CSV", pt: "Transferir o CSV" })}
          </Button>
          <Button iconName="import" onClick={p.handleDhis2IndicatorSelect}>
            {t3({
              en: "Import DHIS2 indicator",
              fr: "Importer un indicateur DHIS2",
              pt: "Importar um indicador DHIS2",
            })}
          </Button>
          <Button
            onClick={handleCreateMapping}
            iconName="plus"
            intent="primary"
          >
            {t3({
              en: "Create DHIS2 Indicator",
              fr: "Créer un indicateur DHIS2",
              pt: "Criar indicador DHIS2",
            })}
          </Button>
        </Show>
      </div>
      <div class="h-0 w-full flex-1">
        <Table
          data={p.rawIndicators}
          columns={allColumns()}
          keyField="raw_indicator_id"
          noRowsMessage={t3({
            en: "No DHIS2 indicators",
            fr: "Aucun indicateur DHIS2",
            pt: "Nenhum indicador DHIS2",
          })}
          bulkActions={bulkActions()}
          selectionLabel={t3({ en: "indicator", fr: "indicateur", pt: "indicador" })}
          fitTableToAvailableHeight
        />
      </div>
    </div>
  );
}
