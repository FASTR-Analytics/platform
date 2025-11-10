import { t, t2, T,
  type CommonIndicatorWithMappings,
  type InstanceDetail,
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
  timQuery,
  type BulkAction,
  type TimQuery,
} from "panther";
import { Show } from "solid-js";
import { serverActions } from "~/server_actions";
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
  instanceDetail: TimQuery<InstanceDetail>;
  backToInstance: () => void;
};

export function IndicatorsManager(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  // Query for indicators
  const indicators = timQuery(
    () => serverActions.getIndicators({}),
    t("Loading indicators..."),
  );

  async function handleBatchUpload() {
    await openEditor({
      element: BatchUploadForm,
      props: {
        silentRefreshIndicators: async () => {
          await p.instanceDetail.silentFetch();
          await indicators.silentFetch();
        },
      },
    });
  }

  async function handleDhis2IndicatorSelect() {
    // Check if credentials exist in session storage
    let credentials = getDhis2SessionCredentials();

    // If no credentials, prompt user to enter them
    if (!credentials) {
      const result = await openComponent({
        element: Dhis2CredentialsForm,
        props: {
          showSaveCheckbox: true,
        },
      });

      if (!result || result.shouldClear || !result.credentials) {
        // User cancelled, don't proceed
        return;
      }

      // Store credentials in session storage
      credentials = result.credentials;

      if (result.shouldSave) {
        setDhis2SessionCredentials(result.credentials);
      }
    }

    await openEditor({
      element: Dhis2IndicatorSelectForm,
      props: {
        credentials,
        silentRefreshIndicators: async () => {
          await p.instanceDetail.silentFetch();
          await indicators.silentFetch();
        },
      },
    });
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
            <Button iconName="chevronLeft" onClick={p.backToInstance} />
            <div class="font-700 flex-1 truncate text-xl">INDICATORS</div>
            <div class="ui-gap-sm flex items-center">
              <Show when={p.isGlobalAdmin}>
                <Button iconName="upload" onClick={handleBatchUpload}>
                  {t("Batch import from CSV")}
                </Button>
              </Show>
              <Button iconName="refresh" onClick={indicators.fetch} />
            </div>
          </div>
        }
      >
        <div class="ui-pad ui-spy h-full w-full overflow-auto xl:flex xl:gap-x-12 xl:space-y-0">
          <StateHolderWrapper state={indicators.state()} noPad>
            {(keyedIndicators) => (
              <>
                <div class="h-full xl:flex-1">
                  <CommonIndicatorsTable
                    commonIndicators={keyedIndicators.commonIndicators}
                    rawIndicators={keyedIndicators.rawIndicators}
                    isGlobalAdmin={p.isGlobalAdmin}
                    silentRefreshIndicators={async () => {
                      await p.instanceDetail.silentFetch();
                      await indicators.silentFetch();
                    }}
                  />
                </div>
                <div class="h-full xl:flex-1">
                  <RawIndicatorsTable
                    commonIndicators={keyedIndicators.commonIndicators}
                    rawIndicators={keyedIndicators.rawIndicators}
                    isGlobalAdmin={p.isGlobalAdmin}
                    handleDhis2IndicatorSelect={handleDhis2IndicatorSelect}
                    silentRefreshIndicators={async () => {
                      await p.instanceDetail.silentFetch();
                      await indicators.silentFetch();
                    }}
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
  silentRefreshIndicators: () => Promise<void>;
}) {
  // Create new indicator
  async function handleCreateIndicator() {
    const _res = await openComponent({
      element: EditIndicatorCommonForm,
      props: {
        rawIndicators: p.rawIndicators,
        silentRefreshIndicators: p.silentRefreshIndicators,
      },
    });
  }

  // Update indicator
  async function handleUpdateIndicator(indicator: CommonIndicatorWithMappings) {
    const _res = await openComponent({
      element: EditIndicatorCommonForm,
      props: {
        rawIndicators: p.rawIndicators,
        existingCommonIndicator: indicator,
        silentRefreshIndicators: p.silentRefreshIndicators,
      },
    });
  }

  // Delete indicator
  async function handleDeleteIndicator(indicator: CommonIndicatorWithMappings) {
    const deleteAction = timActionDelete(
      {
        text: t(`Are you sure you want to delete this indicator?`),
        itemList: [indicator.indicator_common_id],
      },
      () =>
        serverActions.deleteCommonIndicators({
          indicator_common_ids: [indicator.indicator_common_id],
        }),
      p.silentRefreshIndicators,
    );

    await deleteAction.click();
  }

  // Bulk delete indicators
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
    const indicatorText =
      indicatorCount === 1 ? t("this indicator") : t("these indicators");

    const deleteAction = timActionDelete(
      {
        text: t(`Are you sure you want to delete ${indicatorText}?`),
        itemList: indicatorLabels,
      },
      () =>
        serverActions.deleteCommonIndicators({
          indicator_common_ids: indicatorIds,
        }),
      p.silentRefreshIndicators,
    );

    await deleteAction.click();
  }

  const columns: TableColumn<CommonIndicatorWithMappings>[] = [
    {
      key: "indicator_common_id",
      header: t("Common Indicator ID"),
      sortable: true,
      render: (indicator) => (
        <span class="font-mono">{indicator.indicator_common_id}</span>
      ),
    },
    {
      key: "indicator_common_label",
      header: t("Label"),
      sortable: true,
    },
    {
      key: "is_default",
      header: t2(T.FRENCH_UI_STRINGS.default),
      sortable: true,
      render: (indicator) => (
        <span class="">{indicator.is_default ? "✓" : ""}</span>
      ),
    },
    {
      key: "raw_indicator_ids",
      header: t("Mapped To"),
      sortable: true,
      render: (indicator) => (
        <div class="font-mono">{indicator.raw_indicator_ids.join(", ")}</div>
      ),
    },
  ];

  // Add actions column if admin
  if (p.isGlobalAdmin) {
    columns.push({
      key: "actions",
      header: "",
      align: "right",
      render: (indicator) => (
        <div class="ui-gap-sm flex justify-end">
          <Button
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              handleUpdateIndicator(indicator);
            }}
            iconName="pencil"
            intent="base-100"
          >
            {/* {t2(T.FRENCH_UI_STRINGS.edit)} */}
          </Button>
          <Button
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              handleDeleteIndicator(indicator);
            }}
            iconName="trash"
            intent="base-100"
          >
            {/* {t2(T.FRENCH_UI_STRINGS.delete)} */}
          </Button>
        </div>
      ),
    });
  }

  // Bulk actions (only if admin)
  const bulkActions: BulkAction<CommonIndicatorWithMappings>[] = p.isGlobalAdmin
    ? [
        {
          label: t2(T.FRENCH_UI_STRINGS.delete),
          intent: "danger",
          outline: true,
          onClick: handleBulkDeleteIndicators,
        },
      ]
    : [];

  return (
    <div class="flex h-full flex-col">
      <div class="ui-gap-sm flex items-center pb-4">
        <div class="font-700 flex-1 text-xl">{t("Common Indicators")}</div>
        <Show when={p.isGlobalAdmin}>
          <Button
            onClick={handleCreateIndicator}
            iconName="plus"
            intent="primary"
          >
            {t("Create Common Indicator")}
          </Button>
        </Show>
      </div>
      <div class="h-0 w-full flex-1">
        <Table
          data={p.commonIndicators}
          columns={columns}
          keyField="indicator_common_id"
          noRowsMessage={t("No common indicators")}
          bulkActions={bulkActions}
          selectionLabel="indicator"
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
  silentRefreshIndicators: () => Promise<void>;
  handleDhis2IndicatorSelect: () => Promise<void>;
}) {
  // Handlers for mapping CRUD operations
  async function handleCreateMapping() {
    const _res = await openComponent({
      element: EditIndicatorRawForm,
      props: {
        commonIndicators: p.commonIndicators,
        silentRefreshIndicators: p.silentRefreshIndicators,
      },
    });
  }

  async function handleUpdateMapping(indicator: RawIndicatorWithMappings) {
    const _res = await openComponent({
      element: EditIndicatorRawForm,
      props: {
        commonIndicators: p.commonIndicators,
        existingRawIndicator: indicator,
        silentRefreshIndicators: p.silentRefreshIndicators,
      },
    });
  }

  async function handleDeleteMapping(indicator: RawIndicatorWithMappings) {
    const deleteAction = timActionDelete(
      {
        text: t(`Are you sure you want to delete this indicator?`),
        itemList: [indicator.raw_indicator_id],
      },
      () =>
        serverActions.deleteRawIndicators({
          indicator_raw_ids: [indicator.raw_indicator_id],
        }),
      p.silentRefreshIndicators,
    );

    await deleteAction.click();
  }

  // Bulk delete raw indicators
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
    const indicatorText =
      indicatorCount === 1 ? t("this indicator") : t("these indicators");

    const deleteAction = timActionDelete(
      {
        text: t(`Are you sure you want to delete ${indicatorText}?`),
        itemList: indicatorLabels,
      },
      () =>
        serverActions.deleteRawIndicators({ indicator_raw_ids: indicatorIds }),
      p.silentRefreshIndicators,
    );

    await deleteAction.click();
  }

  const columns: TableColumn<RawIndicatorWithMappings>[] = [
    {
      key: "raw_indicator_id",
      header: t("DHIS2 Indicator ID"),
      sortable: true,
      render: (mapping) => (
        <span class="font-mono">{mapping.raw_indicator_id}</span>
      ),
    },
    {
      key: "raw_indicator_label",
      header: t("Label"),
      sortable: true,
    },
    {
      key: "indicator_common_ids",
      header: t("Mapped To"),
      sortable: true,
      render: (mapping) => (
        <span class="font-mono">{mapping.indicator_common_ids.join(", ")}</span>
      ),
    },
  ];

  // Add actions column if admin
  if (p.isGlobalAdmin) {
    columns.push({
      key: "actions",
      header: "",
      align: "right",
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
            >
              {/* {t2(T.FRENCH_UI_STRINGS.edit)} */}
            </Button>
            <Button
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                handleDeleteMapping(mapping);
              }}
              iconName="trash"
              intent="base-100"
            >
              {/* {t2(T.FRENCH_UI_STRINGS.delete)} */}
            </Button>
          </div>
        );
      },
    });
  }

  // Bulk actions (only if admin)
  const bulkActions: BulkAction<RawIndicatorWithMappings>[] = p.isGlobalAdmin
    ? [
        {
          label: t2(T.FRENCH_UI_STRINGS.delete),
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
          {t("DHIS2 Indicators (JSON IDs)")}
        </div>
        <Show when={p.isGlobalAdmin}>
          <Button iconName="import" onClick={p.handleDhis2IndicatorSelect}>
            {t("Import DHIS2 indicator")}
          </Button>
          <Button
            onClick={handleCreateMapping}
            iconName="plus"
            intent="primary"
          >
            {t("Create DHIS2 Indicator")}
          </Button>
        </Show>
      </div>
      <div class="h-0 w-full flex-1">
        <Table
          data={p.rawIndicators}
          columns={columns}
          keyField="raw_indicator_id"
          noRowsMessage={t("No DHIS2 indicators")}
          bulkActions={bulkActions}
          selectionLabel="indicator"
          fitTableToAvailableHeight
        />
      </div>
    </div>
  );
}
