import {
  TC,
  t3,
  type HfaIndicator,
  type ModuleConfigSelectionsHfa,
  type ModuleId,
} from "lib";
import {
  Button,
  EditorComponentProps,
  FrameRightResizable,
  FrameTop,
  HeadingBar,
  Input,
  StateHolderWrapper,
  Table,
  getEditorWrapper,
  getPixelsFromPctClientWidth,
  timActionButton,
  timQuery,
  type APIResponseWithData,
} from "panther";
import { Show, createMemo, createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { EditHfaIndicator } from "../forms_editors/edit_hfa_indicator";
import { HfaCsvUploadForm } from "./hfa_csv_upload_form";

export function SettingsForProjectModuleHFA(
  p: EditorComponentProps<
    {
      projectId: string;
      projectIsLocked: boolean;
      installedModuleId: ModuleId;
      installedModuleLabel: string;
    },
    undefined
  >,
) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [tempIndicators, setTempIndicators] = createStore<HfaIndicator[]>([]);
  const [vars, setVars] = createSignal<
    {
      var_name: string;
      example_values: string;
    }[]
  >([]);
  const [needsSaving, setNeedsSaving] = createSignal<boolean>(false);
  const [varSearch, setVarSearch] = createSignal<string>("");

  const filteredVars = createMemo(() => {
    const search = varSearch().toLowerCase().trim();
    if (!search) return vars();
    return vars().filter((v) => v.var_name.toLowerCase().includes(search));
  });

  const config = timQuery(
    async () => {
      const res = await serverActions.getModuleWithConfigSelections({
        projectId: p.projectId,
        module_id: p.installedModuleId,
      });
      if (res.success === true) {
        if (res.data.configSelections.configType === "hfa") {
          setTempIndicators(res.data.configSelections.indicators);
          setVars(res.data.hfaIndicators ?? []);
        } else {
          return { success: false, err: "Wrong config type" };
        }
      }
      return res as APIResponseWithData<ModuleConfigSelectionsHfa>;
    },
    t3({
      en: "Loading module config selections...",
      fr: "Chargement des configurations du module...",
    }),
  );

  const save = timActionButton(async () => {
    return await serverActions.updateModuleParameters({
      projectId: p.projectId,
      module_id: p.installedModuleId,
      newParams: {
        indicators: unwrap(tempIndicators),
        useSampleWeights: false,
      },
    }); // This needs fixing!!!!
  });

  async function editIndicator(indicator: HfaIndicator) {
    const res = await openEditor({
      element: EditHfaIndicator,
      props: { indicator },
    });
    if (res === "NEEDS_UPDATE") {
      setNeedsSaving(true);
    }
  }

  async function addIndicator() {
    const newIndicator: HfaIndicator = {
      category: "",
      definition: "",
      varName: "",
      rCode: "",
      rFilterCode: "",
      type: "binary",
    };
    const res = await openEditor({
      element: EditHfaIndicator,
      props: { indicator: newIndicator },
    });
    if (res === "NEEDS_UPDATE") {
      setTempIndicators([...tempIndicators, newIndicator]);
      setNeedsSaving(true);
    }
  }

  async function handleCsvUpload() {
    await openEditor({
      element: HfaCsvUploadForm,
      props: {
        onUploadComplete: (indicators: HfaIndicator[], replaceAll: boolean) => {
          if (replaceAll) {
            setTempIndicators(indicators);
          } else {
            // Add to existing, avoiding duplicates by varName
            const existingVarNames = new Set(
              tempIndicators.map((ind) => ind.varName),
            );
            const newIndicators = indicators.filter(
              (ind) => !existingVarNames.has(ind.varName),
            );
            setTempIndicators([...tempIndicators, ...newIndicators]);
          }
          setNeedsSaving(true);
        },
      },
    });
  }

  function handleDownloadCsv() {
    const headers = [
      "category",
      "definition",
      "varName",
      "rCode",
      "type",
      "rFilterCode",
    ];
    const rows = tempIndicators.map((indicator) => [
      indicator.category,
      indicator.definition,
      indicator.varName,
      indicator.rCode,
      indicator.type,
      indicator.rFilterCode ?? "",
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
    link.download = "hfa_indicators.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={`${p.installedModuleLabel} ${t3({ en: "settings", fr: "paramètres" })}`}
        >
          <div class="ui-gap-sm flex">
            <Show when={!p.projectIsLocked}>
              <Button onClick={handleDownloadCsv} intent="neutral" iconName="download">
                {t3({ en: "Download CSV", fr: "Télécharger CSV" })}
              </Button>
            </Show>
            <Show when={!p.projectIsLocked}>
              <Button onClick={handleCsvUpload} intent="neutral" iconName="upload">
                {t3({ en: "Upload CSV", fr: "Téléverser CSV" })}
              </Button>
            </Show>
            <Show when={!p.projectIsLocked}>
              <Button onClick={addIndicator} intent="primary" iconName="plus">
                {t3({ en: "Add Indicator", fr: "Ajouter un indicateur" })}
              </Button>
            </Show>
            <Show when={!p.projectIsLocked}>
              <Button
                onClick={save.click}
                state={save.state()}
                intent="success"
                // disabled={!needsSaving()}
                iconName="save"
              >
                {t3(TC.save)}
              </Button>
            </Show>
            <Button
              onClick={() => p.close(undefined)}
              intent="neutral"
              iconName="x"
            >
              {t3(TC.cancel)}
            </Button>
          </div>
        </HeadingBar>
      }
    >
      <StateHolderWrapper state={config.state()}>
        {(_keyedConfig) => {
          return (
            <FrameRightResizable
              startingWidth={getPixelsFromPctClientWidth("30%")}
              panelChildren={
                <div class="border-base-300 flex h-full flex-col border-l">
                  <div class="ui-pad border-base-300 border-b">
                    <Input
                      value={varSearch()}
                      onChange={setVarSearch}
                      placeholder={t3({
                        en: "Search variables...",
                        fr: "Rechercher des variables...",
                      })}
                      fullWidth
                    />
                  </div>
                  <div class="ui-pad flex-1 overflow-auto">
                    <Table
                      data={filteredVars()}
                      keyField="var_name"
                      fitTableToAvailableHeight
                      columns={[
                        {
                          key: "var_name",
                          header: t3({ en: "Variable", fr: "Variable" }),
                          sortable: true,
                          render: (v) => (
                            <div class="font-mono">{v.var_name}</div>
                          ),
                        },
                        {
                          key: "example_values",
                          header: t3({
                            en: "Example Values",
                            fr: "Exemples de valeurs",
                          }),
                          render: (v) => (
                            <div class="truncate font-mono">
                              {v.example_values}
                            </div>
                          ),
                        },
                      ]}
                    />
                  </div>
                </div>
              }
            >
              <div class="ui-pad h-full w-full">
                <EditorWrapper>
                  <Table
                    data={tempIndicators}
                    keyField="varName"
                    onRowClick={(indicator) => editIndicator(indicator)}
                    fitTableToAvailableHeight
                    selectionLabel={t3({ en: "indicator", fr: "indicateur" })}
                    bulkActions={[
                      {
                        label: t3(TC.delete),
                        intent: "danger",
                        onClick: (selectedIndicators) => {
                          const selectedVarNames = new Set(
                            selectedIndicators.map((ind) => ind.varName),
                          );
                          setTempIndicators(
                            tempIndicators.filter(
                              (ind) => !selectedVarNames.has(ind.varName),
                            ),
                          );
                          setNeedsSaving(true);
                          return "CLEAR_SELECTION";
                        },
                      },
                    ]}
                    columns={[
                      {
                        key: "category",
                        header: t3({ en: "Category", fr: "Catégorie" }),
                        // sortable: true,
                      },
                      {
                        key: "definition",
                        header: t3({ en: "Definition", fr: "Définition" }),
                        // sortable: true,
                      },
                      {
                        key: "varName",
                        header: t3({
                          en: "Variable Name",
                          fr: "Nom de la variable",
                        }),
                        // sortable: true,
                      },
                      {
                        key: "type",
                        header: t3({ en: "Type", fr: "Type" }),
                        render: (indicator) => (
                          <code class="font-mono text-xs">
                            {indicator.type === "binary"
                              ? t3({ en: "Boolean", fr: "Booléen" })
                              : t3({ en: "Numeric", fr: "Numérique" })}
                          </code>
                        ),
                      },
                      {
                        key: "rCode",
                        header: t3({ en: "R Code", fr: "Code R" }),
                        render: (indicator) => (
                          <code class="font-mono text-xs">
                            {indicator.rCode}
                          </code>
                        ),
                      },
                      {
                        key: "rFilterCode",
                        header: t3({
                          en: "R Filter Code",
                          fr: "Code de filtre R",
                        }),
                        render: (indicator) => (
                          <code class="font-mono text-xs">
                            {indicator.rFilterCode}
                          </code>
                        ),
                      },
                    ]}
                    groups={[
                      {
                        key: "category",
                        label: (items) =>
                          `${items[0].category} (${items.length} ${t3({ en: "indicators", fr: "indicateurs" })})`,
                        groupBy: (item) => item.category,
                      },
                    ]}
                    currentGroup="category"
                    noRowsMessage={t3({
                      en: "No indicators configured",
                      fr: "Aucun indicateur configuré",
                    })}
                  />
                </EditorWrapper>
              </div>
            </FrameRightResizable>
          );
        }}
      </StateHolderWrapper>
    </FrameTop>
  );
}
