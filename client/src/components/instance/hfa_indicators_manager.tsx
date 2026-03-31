import { t3, TC, type HfaIndicator, type InstanceDetail } from "lib";
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
import { EditHfaIndicator } from "../forms_editors/edit_hfa_indicator";
import { HfaIndicatorsCsvUploadForm } from "./hfa_indicators_csv_upload_form";

type Props = {
  isGlobalAdmin: boolean;
  instanceDetail: TimQuery<InstanceDetail>;
  backToInstance: () => void;
};

export function HfaIndicatorsManager(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const indicators = timQuery(
    () => serverActions.getHfaIndicators({}),
    t3({ en: "Loading HFA indicators...", fr: "Chargement des indicateurs HFA..." }),
  );

  async function silentRefreshIndicators() {
    await p.instanceDetail.silentFetch();
    await indicators.silentFetch();
  }

  async function handleCreate() {
    const st = indicators.state();
    const sortOrder = st.status === "ready" ? st.data.length : 0;
    await openComponent({
      element: EditHfaIndicator,
      props: {
        sortOrder,
        silentRefreshIndicators,
      },
    });
  }

  async function handleEdit(indicator: HfaIndicator) {
    const st = indicators.state();
    const sortOrder = st.status === "ready"
      ? st.data.findIndex((i: HfaIndicator) => i.varName === indicator.varName)
      : 0;
    await openComponent({
      element: EditHfaIndicator,
      props: {
        existingIndicator: indicator,
        sortOrder: sortOrder >= 0 ? sortOrder : 0,
        silentRefreshIndicators,
      },
    });
  }

  async function handleDelete(indicator: HfaIndicator) {
    const deleteAction = timActionDelete(
      {
        text: t3({ en: "Are you sure you want to delete this indicator?", fr: "Êtes-vous sûr de vouloir supprimer cet indicateur ?" }),
        itemList: [indicator.varName],
      },
      () => serverActions.deleteHfaIndicators({ varNames: [indicator.varName] }),
      silentRefreshIndicators,
    );
    await deleteAction.click();
  }

  async function handleBulkDelete(selectedIndicators: HfaIndicator[]) {
    const varNames = selectedIndicators.map((i) => i.varName);
    const deleteAction = timActionDelete(
      {
        text: varNames.length === 1
          ? t3({ en: "Are you sure you want to delete this indicator?", fr: "Êtes-vous sûr de vouloir supprimer cet indicateur ?" })
          : t3({ en: "Are you sure you want to delete these indicators?", fr: "Êtes-vous sûr de vouloir supprimer ces indicateurs ?" }),
        itemList: varNames,
      },
      () => serverActions.deleteHfaIndicators({ varNames }),
      silentRefreshIndicators,
    );
    await deleteAction.click();
  }

  function handleDownloadCsv(data: HfaIndicator[]) {
    const headers = ["varName", "category", "definition", "type", "rCode", "rFilterCode"];
    const rows = data.map((ind) => [
      ind.varName,
      ind.category,
      ind.definition,
      ind.type,
      ind.rCode,
      ind.rFilterCode ?? "",
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hfa_indicators.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleCsvUpload() {
    await openEditor({
      element: HfaIndicatorsCsvUploadForm,
      props: {
        silentRefreshIndicators,
      },
    });
  }

  const columns: TableColumn<HfaIndicator>[] = [
    {
      key: "category",
      header: t3({ en: "Category", fr: "Catégorie" }),
      sortable: true,
    },
    {
      key: "varName",
      header: t3({ en: "Variable Name", fr: "Nom de variable" }),
      sortable: true,
      render: (ind) => <span class="font-mono">{ind.varName}</span>,
    },
    {
      key: "definition",
      header: t3({ en: "Definition", fr: "Définition" }),
      sortable: true,
    },
    {
      key: "type",
      header: t3({ en: "Type", fr: "Type" }),
      sortable: true,
      render: (ind) => <span>{ind.type === "binary" ? "Boolean" : "Numeric"}</span>,
    },
    {
      key: "rCode",
      header: t3({ en: "R Code", fr: "Code R" }),
      render: (ind) => <span class="font-mono text-xs">{ind.rCode}</span>,
    },
    {
      key: "rFilterCode",
      header: t3({ en: "Filter Code", fr: "Code filtre" }),
      render: (ind) => <span class="font-mono text-xs">{ind.rFilterCode ?? ""}</span>,
    },
  ];

  if (p.isGlobalAdmin) {
    columns.push({
      key: "actions",
      header: "",
      alignH: "right",
      render: (ind) => (
        <div class="ui-gap-sm flex justify-end">
          <Button
            onClick={(e: MouseEvent) => { e.stopPropagation(); handleEdit(ind); }}
            iconName="pencil"
            intent="base-100"
          />
          <Button
            onClick={(e: MouseEvent) => { e.stopPropagation(); handleDelete(ind); }}
            iconName="trash"
            intent="base-100"
          />
        </div>
      ),
    });
  }

  const bulkActions: BulkAction<HfaIndicator>[] = p.isGlobalAdmin
    ? [{ label: t3(TC.delete), intent: "danger", outline: true, onClick: handleBulkDelete }]
    : [];

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
            <Button iconName="chevronLeft" onClick={p.backToInstance} />
            <div class="font-700 flex-1 truncate text-xl">
              {t3({ en: "HFA INDICATORS", fr: "INDICATEURS HFA" })}
            </div>
            <div class="ui-gap-sm flex items-center">
              <Show when={p.isGlobalAdmin}>
                <Button iconName="upload" onClick={handleCsvUpload}>
                  {t3({ en: "Upload CSV", fr: "Téléverser CSV" })}
                </Button>
                <Button iconName="plus" intent="primary" onClick={handleCreate}>
                  {t3({ en: "Add", fr: "Ajouter" })}
                </Button>
              </Show>
              <Button iconName="refresh" onClick={indicators.fetch} />
            </div>
          </div>
        }
      >
        <div class="ui-pad h-full w-full overflow-auto">
          <StateHolderWrapper state={indicators.state()} noPad>
            {(keyedIndicators) => (
              <div class="flex h-full flex-col">
                <div class="ui-gap-sm flex flex-none items-center pb-4">
                  <div class="font-700 flex-1 text-xl">
                    {t3({ en: "Indicators", fr: "Indicateurs" })} ({keyedIndicators.length})
                  </div>
                  <Show when={p.isGlobalAdmin && keyedIndicators.length > 0}>
                    <Button
                      onClick={() => handleDownloadCsv(keyedIndicators)}
                      iconName="download"
                      intent="neutral"
                    >
                      {t3({ en: "Download CSV", fr: "Télécharger CSV" })}
                    </Button>
                  </Show>
                </div>
                <div class="h-0 w-full flex-1">
                  <Table
                    data={keyedIndicators}
                    columns={columns}
                    keyField="varName"
                    noRowsMessage={t3({ en: "No HFA indicators configured", fr: "Aucun indicateur HFA configuré" })}
                    bulkActions={bulkActions}
                    selectionLabel={t3({ en: "indicator", fr: "indicateur" })}
                    fitTableToAvailableHeight
                    onRowClick={(ind: HfaIndicator) => { if (p.isGlobalAdmin) handleEdit(ind); }}
                  />
                </div>
              </div>
            )}
          </StateHolderWrapper>
        </div>
      </FrameTop>
    </EditorWrapper>
  );
}
