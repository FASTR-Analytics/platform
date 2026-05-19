import {
  t3,
  TC,
  type HfaDictionaryForValidation,
  type HfaIndicator,
  type HfaIndicatorCode,
} from "lib";
import {
  Button,
  FrameTop,
  getQueryStateFromApiResponse,
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
import { getHfaDictionaryFromCacheOrFetch } from "~/state/instance/t2_datasets";
import { getHfaIndicatorsFromCacheOrFetch } from "~/state/instance/t2_indicators";
import { EditHfaIndicator } from "../forms_editors/edit_hfa_indicator";
import { HfaIndicatorCodeEditor } from "./hfa_indicator_code_editor";
import { HfaIndicatorsCsvUploadForm } from "./hfa_indicators_csv_upload_form";
import { validateRCode } from "./hfa_r_code_validator";

type Props = {
  isGlobalAdmin: boolean;
  backToInstance: () => void;
};

export function HfaIndicatorsManager(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [indicators, setIndicators] = createSignal<StateHolder<HfaIndicator[]>>(
    {
      status: "loading",
      msg: t3({
        en: "Loading HFA indicators...",
        fr: "Chargement des indicateurs HFA...",
      }),
    },
  );
  const [dictionary, setDictionary] = createSignal<
    StateHolder<HfaDictionaryForValidation>
  >({ status: "loading" });

  createEffect(async () => {
    const version = instanceState.hfaIndicatorsVersion;
    if (!version) return;
    const res = await getHfaIndicatorsFromCacheOrFetch(version);
    setIndicators(getQueryStateFromApiResponse(res));
  });

  createEffect(async () => {
    const hfaCacheHash = instanceState.hfaCacheHash;
    if (!hfaCacheHash) return;
    const res = await getHfaDictionaryFromCacheOrFetch(hfaCacheHash);
    setDictionary(getQueryStateFromApiResponse(res));
  });

  const [revalidating, setRevalidating] = createSignal(false);

  async function handleRevalidateAll() {
    const dictState = dictionary();
    if (dictState.status !== "ready") return;
    const dict = dictState.data;

    setRevalidating(true);

    const codeRes = await serverActions.getAllHfaIndicatorCode({});
    if (!codeRes.success) {
      setRevalidating(false);
      return;
    }

    const st = indicators();
    if (st.status !== "ready") {
      setRevalidating(false);
      return;
    }

    // Group code by varName
    const codeByVarName = new Map<string, HfaIndicatorCode[]>();
    for (const c of codeRes.data) {
      const arr = codeByVarName.get(c.varName) ?? [];
      arr.push(c);
      codeByVarName.set(c.varName, arr);
    }

    const allIndicatorVarNames = new Set(st.data.map((i) => i.varName));

    // Compute validation for each indicator
    const updates: {
      varName: string;
      hasSyntaxError: boolean;
      codeConsistent: boolean;
    }[] = [];
    for (const ind of st.data) {
      const indCode = codeByVarName.get(ind.varName) ?? [];
      const otherVarNames = new Set(allIndicatorVarNames);
      otherVarNames.delete(ind.varName);

      let hasSyntaxError = false;
      for (const c of indCode) {
        const tp = dict.timePoints.find(
          (t) => t.timePoint === c.timePoint,
        );
        const availableVars = tp
          ? new Set(tp.vars.map((v) => v.varName))
          : new Set<string>();
        if (c.rCode.trim()) {
          const result = validateRCode(c.rCode, availableVars, otherVarNames);
          if (result.syntaxErrors.length > 0 || result.warnings.length > 0) {
            hasSyntaxError = true;
          }
        }
        if (c.rFilterCode?.trim()) {
          const result = validateRCode(
            c.rFilterCode,
            availableVars,
            otherVarNames,
          );
          if (result.syntaxErrors.length > 0 || result.warnings.length > 0) {
            hasSyntaxError = true;
          }
        }
      }

      const nonEmpty = indCode.filter(
        (c) => c.rCode.trim() || c.rFilterCode?.trim(),
      );
      let codeConsistent = true;
      if (nonEmpty.length > 1) {
        const first = nonEmpty[0];
        codeConsistent = nonEmpty.every(
          (c) =>
            c.rCode.trim() === first.rCode.trim() &&
            (c.rFilterCode?.trim() ?? "") === (first.rFilterCode?.trim() ?? ""),
        );
      }

      updates.push({ varName: ind.varName, hasSyntaxError, codeConsistent });
    }

    // Send bulk update - SSE will trigger refetch via createEffect
    await serverActions.bulkUpdateHfaIndicatorValidation({ updates });
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
    const dictState = dictionary();
    if (dictState.status !== "ready") return;
    const dict = dictState.data;
    await openEditor({
      element: HfaIndicatorCodeEditor,
      props: {
        indicator,
        dictionary: dict,
        allIndicatorVarNames: allIndicators.map((i) => i.varName),
      },
    });
  }

  async function handleDelete(indicator: HfaIndicator) {
    const deleteAction = timActionDelete(
      {
        text: t3({
          en: "Are you sure you want to delete this indicator?",
          fr: "Êtes-vous sûr de vouloir supprimer cet indicateur ?",
        }),
        itemList: [indicator.varName],
      },
      () =>
        serverActions.deleteHfaIndicators({ varNames: [indicator.varName] }),
    );
    await deleteAction.click();
  }

  async function handleBulkDelete(selectedIndicators: HfaIndicator[]) {
    const varNames = selectedIndicators.map((i) => i.varName);
    const deleteAction = timActionDelete(
      {
        text:
          varNames.length === 1
            ? t3({
                en: "Are you sure you want to delete this indicator?",
                fr: "Êtes-vous sûr de vouloir supprimer cet indicateur ?",
              })
            : t3({
                en: "Are you sure you want to delete these indicators?",
                fr: "Êtes-vous sûr de vouloir supprimer ces indicateurs ?",
              }),
        itemList: varNames,
      },
      () => serverActions.deleteHfaIndicators({ varNames }),
    );
    await deleteAction.click();
  }

  async function handleDownloadCsv(data: HfaIndicator[]) {
    const dictState = dictionary();
    if (dictState.status !== "ready") return;
    const dict = dictState.data;
    const codeRes = await serverActions.getAllHfaIndicatorCode({});
    if (!codeRes.success) return;

    const sortedTimePoints = [...dict.timePoints].sort((a, b) =>
      a.timePoint.localeCompare(b.timePoint),
    );

    const headers = [
      "varName",
      "category",
      "definition",
      "type",
      "aggregation",
    ];
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
    const dictState = dictionary();
    if (dictState.status !== "ready") return;
    await openEditor({
      element: HfaIndicatorsCsvUploadForm,
      props: { dictionary: dictState.data },
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
      render: (ind) => (
        <span>{ind.type === "binary" ? "Boolean" : "Numeric"}</span>
      ),
    },
    {
      key: "hasSyntaxError",
      header: t3({ en: "Syntax", fr: "Syntaxe" }),
      sortable: true,
      render: (ind) => (
        <span
          class={ind.hasSyntaxError ? "text-danger font-700" : "text-success"}
        >
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
        <span class="">
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
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              const st = indicators();
              handleOpenCodeEditor(ind, st.status === "ready" ? st.data : []);
            }}
            iconName="pencil"
            intent="base-100"
          />
          <Button
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              handleDelete(ind);
            }}
            iconName="trash"
            intent="base-100"
          />
        </div>
      ),
    });
  }

  const bulkActions: BulkAction<HfaIndicator>[] = p.isGlobalAdmin
    ? [
        {
          label: t3(TC.delete),
          intent: "danger",
          outline: true,
          onClick: handleBulkDelete,
        },
      ]
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
                    {t3({ en: "Indicators", fr: "Indicateurs" })} (
                    {keyedIndicators.length})
                  </div>
                  <Show when={p.isGlobalAdmin && keyedIndicators.length > 0}>
                    <Button
                      onClick={() => {
                        handleDownloadCsv(keyedIndicators);
                      }}
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
                    noRowsMessage={t3({
                      en: "No HFA indicators configured",
                      fr: "Aucun indicateur HFA configuré",
                    })}
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
