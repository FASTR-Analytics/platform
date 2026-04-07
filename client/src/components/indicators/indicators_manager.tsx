import { t3, TC,
  type CommonIndicatorWithMappings,
  type InstanceIndicatorDetails,
  type RawIndicatorWithMappings } from "lib";
import {
  Button,
  FrameTop,
  StateHolderWrapper,
  Table,
  TableColumn,
  getEditorWrapper,
  openComponent,
  timActionDelete,
  type BulkAction,
  type StateHolder,
} from "panther";
import { Show, createEffect, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance_state";
import { getIndicatorsFromCacheOrFetch } from "~/state/instance_data_caches";
import { Dhis2CredentialsForm } from "../forms_editors/dhis2_credentials_form";
import { EditIndicatorCommonForm } from "./_edit_indicator_common";
import { EditIndicatorRawForm } from "./_edit_indicator_raw";
import { BatchUploadForm } from "./batch_upload_form";
import { Dhis2IndicatorSelectForm } from "./dhis2_indicator_select_form";
import {
  getDhis2SessionCredentials,
  setDhis2SessionCredentials,
} from "~/state/dhis2-session-storage";

type Props = {
  isGlobalAdmin: boolean;
  backToInstance: () => void;
};

export function IndicatorsManager(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [indicators, setIndicators] = createSignal<StateHolder<InstanceIndicatorDetails>>({
    status: "loading",
    msg: t3({ en: "Loading indicators...", fr: "Chargement des indicateurs..." }),
  });

  createEffect(async () => {
    const version = instanceState.indicatorMappingsVersion;
    if (!version) return;
    setIndicators({ status: "loading", msg: t3({ en: "Loading indicators...", fr: "Chargement des indicateurs..." }) });
    const res = await getIndicatorsFromCacheOrFetch(version);
    if (res.success) {
      setIndicators({ status: "ready", data: res.data });
    } else {
      setIndicators({ status: "error", err: res.err });
    }
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
        row.map((cell: string) => `"${cell.replace(/"/g, '""')}"`).join(",")
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
        row.map((cell: string) => `"${cell.replace(/"/g, '""')}"`).join(",")
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
    const result = await openComponent({
      element: Dhis2CredentialsForm,
      props: {
        existingCredentials: getDhis2SessionCredentials() ?? undefined,
        showSaveCheckbox: true,
      },
    });

    if (!result || result.shouldClear || !result.credentials) {
      return;
    }

    if (result.shouldSave) {
      setDhis2SessionCredentials(result.credentials);
    }

    await openEditor({
      element: Dhis2IndicatorSelectForm,
      props: {
        credentials: result.credentials,
      },
    });
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
            <Button iconName="chevronLeft" onClick={p.backToInstance} />
            <div class="font-700 flex-1 truncate text-xl">{t3({ en: "INDICATORS", fr: "INDICATEURS" })}</div>
            <div class="ui-gap-sm flex items-center">
              <Show when={p.isGlobalAdmin}>
                <Button iconName="upload" onClick={handleBatchUpload}>
                  {t3({ en: "Batch import from CSV", fr: "Importation groupée depuis CSV" })}
                </Button>
              </Show>
            </div>
          </div>
        }
      >
        <div class="ui-pad ui-spy h-full w-full overflow-auto xl:flex xl:gap-x-12 xl:space-y-0">
          <StateHolderWrapper state={indicators()} noPad>
            {(keyedIndicators) => (
              <>
                <div class="h-full xl:flex-1">
                  <CommonIndicatorsTable
                    commonIndicators={keyedIndicators.commonIndicators}
                    rawIndicators={keyedIndicators.rawIndicators}
                    isGlobalAdmin={p.isGlobalAdmin}
                    handleDownloadCsv={handleDownloadCommonCsv}
                  />
                </div>
                <div class="h-full xl:flex-1">
                  <RawIndicatorsTable
                    commonIndicators={keyedIndicators.commonIndicators}
                    rawIndicators={keyedIndicators.rawIndicators}
                    isGlobalAdmin={p.isGlobalAdmin}
                    handleDhis2IndicatorSelect={handleDhis2IndicatorSelect}
                    handleDownloadCsv={handleDownloadRawCsv}
                  />
                </div>
              </>
            )}
          </StateHolderWrapper>
        </div>
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
  isGlobalAdmin: boolean;
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
    const deleteAction = timActionDelete(
      {
        text: t3({ en: "Are you sure you want to delete this indicator?", fr: "Êtes-vous sûr de vouloir supprimer cet indicateur ?" }),
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
    const deleteAction = timActionDelete(
      {
        text: indicatorCount === 1
          ? t3({ en: "Are you sure you want to delete this indicator?", fr: "Êtes-vous sûr de vouloir supprimer cet indicateur ?" })
          : t3({ en: "Are you sure you want to delete these indicators?", fr: "Êtes-vous sûr de vouloir supprimer ces indicateurs ?" }),
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
      header: t3({ en: "Common Indicator ID", fr: "ID de l'indicateur commun" }),
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
      header: t3({ en: "Default", fr: "Par défaut" }),
      sortable: true,
      render: (indicator) => (
        <span class="">{indicator.is_default ? "✓" : ""}</span>
      ),
    },
    {
      key: "raw_indicator_ids",
      header: t3({ en: "Mapped To", fr: "Associé à" }),
      sortable: true,
      render: (indicator) => (
        <div class="font-mono">{indicator.raw_indicator_ids.join(", ")}</div>
      ),
    },
  ];

  if (p.isGlobalAdmin) {
    columns.push({
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
    });
  }

  const bulkActions: BulkAction<CommonIndicatorWithMappings>[] = p.isGlobalAdmin
    ? [
        {
          label: t3(TC.delete),
          intent: "danger",
          outline: true,
          onClick: handleBulkDeleteIndicators,
        },
      ]
    : [];

  return (
    <div class="flex h-full flex-col">
      <div class="ui-gap-sm flex items-center pb-4">
        <div class="font-700 flex-1 text-xl">{t3({ en: "Common Indicators", fr: "Indicateurs communs" })}</div>
        <Show when={p.isGlobalAdmin}>
          <Button
            onClick={() => p.handleDownloadCsv(p.commonIndicators)}
            iconName="download"
            intent="neutral"
          >
            {t3({ en: "Download CSV", fr: "Télécharger le CSV" })}
          </Button>
          <Button
            onClick={handleCreateIndicator}
            iconName="plus"
            intent="primary"
          >
            {t3({ en: "Create Common Indicator", fr: "Créer un indicateur commun" })}
          </Button>
        </Show>
      </div>
      <div class="h-0 w-full flex-1">
        <Table
          data={p.commonIndicators}
          columns={columns}
          keyField="indicator_common_id"
          noRowsMessage={t3({ en: "No common indicators", fr: "Aucun indicateur commun" })}
          bulkActions={bulkActions}
          selectionLabel={t3({ en: "indicator", fr: "indicateur" })}
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
  isGlobalAdmin: boolean;
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
    const deleteAction = timActionDelete(
      {
        text: t3({ en: "Are you sure you want to delete this indicator?", fr: "Êtes-vous sûr de vouloir supprimer cet indicateur ?" }),
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
    const deleteAction = timActionDelete(
      {
        text: indicatorCount === 1
          ? t3({ en: "Are you sure you want to delete this indicator?", fr: "Êtes-vous sûr de vouloir supprimer cet indicateur ?" })
          : t3({ en: "Are you sure you want to delete these indicators?", fr: "Êtes-vous sûr de vouloir supprimer ces indicateurs ?" }),
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
      header: t3({ en: "DHIS2 Indicator ID", fr: "ID de l'indicateur DHIS2" }),
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
      header: t3({ en: "Mapped To", fr: "Associé à" }),
      sortable: true,
      render: (mapping) => (
        <span class="font-mono">{mapping.indicator_common_ids.join(", ")}</span>
      ),
    },
  ];

  if (p.isGlobalAdmin) {
    columns.push({
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
    });
  }

  const bulkActions: BulkAction<RawIndicatorWithMappings>[] = p.isGlobalAdmin
    ? [
        {
          label: t3(TC.delete),
          intent: "danger",
          outline: true,
          onClick: handleBulkDeleteRawIndicators,
        },
      ]
    : [];

  return (
    <div class="flex h-full flex-col">
      <div class="ui-gap-sm flex flex-none items-center pb-4">
        <div class="font-700 flex-1 text-xl">
          {t3({ en: "DHIS2 Indicators (JSON IDs)", fr: "Indicateurs DHIS2 (ID JSON)" })}
        </div>
        <Show when={p.isGlobalAdmin}>
          <Button
            onClick={() => p.handleDownloadCsv(p.rawIndicators)}
            iconName="download"
            intent="neutral"
          >
            {t3({ en: "Download CSV", fr: "Télécharger le CSV" })}
          </Button>
          <Button iconName="import" onClick={p.handleDhis2IndicatorSelect}>
            {t3({ en: "Import DHIS2 indicator", fr: "Importer un indicateur DHIS2" })}
          </Button>
          <Button
            onClick={handleCreateMapping}
            iconName="plus"
            intent="primary"
          >
            {t3({ en: "Create DHIS2 Indicator", fr: "Créer un indicateur DHIS2" })}
          </Button>
        </Show>
      </div>
      <div class="h-0 w-full flex-1">
        <Table
          data={p.rawIndicators}
          columns={columns}
          keyField="raw_indicator_id"
          noRowsMessage={t3({ en: "No DHIS2 indicators", fr: "Aucun indicateur DHIS2" })}
          bulkActions={bulkActions}
          selectionLabel={t3({ en: "indicator", fr: "indicateur" })}
          fitTableToAvailableHeight
        />
      </div>
    </div>
  );
}
