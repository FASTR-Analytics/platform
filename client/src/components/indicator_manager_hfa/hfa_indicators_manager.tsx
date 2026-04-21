import {
  t3,
  TC,
  type HfaIndicator,
} from "lib";
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
import { instanceState } from "~/state/instance/t1_store";
import { getHfaIndicatorsFromCacheOrFetch } from "~/state/instance/t2_indicators";
import { EditHfaIndicator } from "../forms_editors/edit_hfa_indicator";
import { HfaIndicatorCodeEditor } from "./hfa_indicator_code_editor";
import { HfaIndicatorsCsvUploadForm } from "./hfa_indicators_csv_upload_form";

type Props = {
  isGlobalAdmin: boolean;
  backToInstance: () => void;
};

export function HfaIndicatorsManager(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [indicators, setIndicators] = createSignal<StateHolder<HfaIndicator[]>>({
    status: "loading",
    msg: t3({ en: "Loading HFA indicators...", fr: "Chargement des indicateurs HFA..." }),
  });

  createEffect(async () => {
    const version = instanceState.hfaIndicatorsVersion;
    if (!version) return;
    setIndicators({ status: "loading", msg: t3({ en: "Loading HFA indicators...", fr: "Chargement des indicateurs HFA..." }) });
    const res = await getHfaIndicatorsFromCacheOrFetch(version);
    if (res.success) {
      setIndicators({ status: "ready", data: res.data });
    } else {
      setIndicators({ status: "error", err: res.err });
    }
  });

  const [revalidating, setRevalidating] = createSignal(false);

  async function handleRevalidateAll() {
    setRevalidating(true);
    const res = await serverActions.revalidateAllHfaIndicators({});
    if (res.success) {
      const version = instanceState.hfaIndicatorsVersion;
      if (version) {
        const fetchRes = await getHfaIndicatorsFromCacheOrFetch(version);
        if (fetchRes.success) {
          setIndicators({ status: "ready", data: fetchRes.data });
        }
      }
    }
    setRevalidating(false);
  }

  async function handleCreate() {
    const st = indicators();
    const sortOrder = st.status === "ready" ? st.data.length : 0;
    await openComponent({
      element: EditHfaIndicator,
      props: {
        sortOrder,
      },
    });
  }

  async function handleOpenCodeEditor(
    indicator: HfaIndicator,
    allIndicators: HfaIndicator[],
  ) {
    const dictRes = await serverActions.getHfaDictionaryForValidation({});
    if (!dictRes.success) return;
    await openEditor({
      element: HfaIndicatorCodeEditor,
      props: {
        indicator,
        dictionary: dictRes.data,
        allIndicatorVarNames: allIndicators.map((i) => i.varName),
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
    );
    await deleteAction.click();
  }

  async function handleDownloadCsv(data: HfaIndicator[]) {
    const dictRes = await serverActions.getHfaDictionaryForValidation({});
    if (!dictRes.success) return;
    const codeRes = await serverActions.getAllHfaIndicatorCode({});
    if (!codeRes.success) return;

    const sortedTimePoints = [...dictRes.data.timePoints].sort((a, b) =>
      a.timePoint.localeCompare(b.timePoint),
    );

    const headers = ["varName", "category", "definition", "type", "aggregation"];
    for (let k = 0; k < sortedTimePoints.length; k++) {
      headers.push(`r_code_${k + 1}`, `r_filter_code_${k + 1}`);
    }

    const codeByKey = new Map<string, { rCode: string; rFilterCode: string }>();
    for (const c of codeRes.data) {
      codeByKey.set(`${c.varName}__${c.timePoint}`, {
        rCode: c.rCode,
        rFilterCode: c.rFilterCode ?? "",
      });
    }

    const rows = data.map((ind) => {
      const row: string[] = [
        ind.varName,
        ind.category,
        ind.definition,
        ind.type,
        ind.aggregation,
      ];
      for (const tp of sortedTimePoints) {
        const entry = codeByKey.get(`${ind.varName}__${tp.timePoint}`);
        row.push(entry?.rCode ?? "", entry?.rFilterCode ?? "");
      }
      return row;
    });

    const escape = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map(escape).join(",")),
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
    const dictRes = await serverActions.getHfaDictionaryForValidation({});
    if (!dictRes.success) return;
    await openEditor({
      element: HfaIndicatorsCsvUploadForm,
      props: { dictionary: dictRes.data },
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
      key: "hasSyntaxError",
      header: t3({ en: "Syntax", fr: "Syntaxe" }),
      sortable: true,
      render: (ind) => (
        <span class={ind.hasSyntaxError ? "text-danger font-700" : "text-success"}>
          {ind.hasSyntaxError
            ? t3({ en: "Error", fr: "Erreur" })
            : t3({ en: "OK", fr: "OK" })}
        </span>
      ),
    },
    {
      key: "codeConsistent",
      header: t3({ en: "Consistent", fr: "Cohérent" }),
      sortable: true,
      render: (ind) => (
        <span class={ind.codeConsistent ? "text-success" : "text-warning font-700"}>
          {ind.codeConsistent
            ? t3({ en: "Yes", fr: "Oui" })
            : t3({ en: "No", fr: "Non" })}
        </span>
      ),
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
            onClick={(e: MouseEvent) => { e.stopPropagation(); const st = indicators(); handleOpenCodeEditor(ind, st.status === "ready" ? st.data : []); }}
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
                <Button
                  iconName="refresh"
                  onClick={handleRevalidateAll}
                  loading={revalidating()}
                >
                  {t3({ en: "Revalidate all", fr: "Revalider tout" })}
                </Button>
                <Button iconName="upload" onClick={handleCsvUpload}>
                  {t3({ en: "Upload CSV", fr: "Téléverser CSV" })}
                </Button>
                <Button iconName="plus" intent="primary" onClick={handleCreate}>
                  {t3({ en: "Add", fr: "Ajouter" })}
                </Button>
              </Show>
            </div>
          </div>
        }
      >
        <div class="ui-pad h-full w-full overflow-auto">
          <StateHolderWrapper state={indicators()} noPad>
            {(keyedIndicators) => (
              <div class="flex h-full flex-col">
                <div class="ui-gap-sm flex flex-none items-center pb-4">
                  <div class="font-700 flex-1 text-xl">
                    {t3({ en: "Indicators", fr: "Indicateurs" })} ({keyedIndicators.length})
                  </div>
                  <Show when={p.isGlobalAdmin && keyedIndicators.length > 0}>
                    <Button
                      onClick={() => { handleDownloadCsv(keyedIndicators); }}
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
