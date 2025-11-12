import {
  t, t2, T,
  type HfaIndicator,
  type ModuleConfigSelectionsHfa,
  type ModuleId
} from "lib";
import {
  Button,
  EditorComponentProps,
  FrameRight,
  FrameRightResizable,
  FrameTop,
  HeadingBar,
  Input,
  StateHolderWrapper,
  Table,
  getEditorWrapper,
  getPixelsFromPctClientWidth,
  getTruncatedString,
  openComponent,
  timActionButton,
  timQuery,
  type APIResponseWithData,
} from "panther";
import { For, Show, createMemo, createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { EditHfaIndicator } from "../forms_editors/edit_hfa_indicator";

export function SettingsForProjectModuleHFA(
  p: EditorComponentProps<
    {
      projectId: string;
      projectIsLocked: boolean;
      installedModuleId: ModuleId;
      installedModuleLabel: string;
      silentRefreshProject: () => Promise<void>;
    },
    undefined
  >,
) {

  const { openEditor, EditorWrapper } = getEditorWrapper()

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

  const config = timQuery(async () => {
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
  }, "Loading module config selections...");

  const save = timActionButton(async () => {
    return await serverActions.updateModuleParameters({
      projectId: p.projectId,
      module_id: p.installedModuleId,
      newParams: {
        indicators: unwrap(tempIndicators),
        useSampleWeights: false,
      },
    }); // This needs fixing!!!!
  }, p.silentRefreshProject);

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

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading={`${p.installedModuleLabel} ${t2(T.FRENCH_UI_STRINGS.settings_1)}`}>
          <div class="ui-gap-sm flex">
            <Show when={!p.projectIsLocked}>
              <Button
                onClick={addIndicator}
                intent="primary"
                iconName="plus"
              >
                {t("Add Indicator")}
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
                {t2(T.FRENCH_UI_STRINGS.save)}
              </Button>
            </Show>
            <Button
              onClick={() => p.close(undefined)}
              intent="neutral"
              iconName="x"
            >
              {t2(T.FRENCH_UI_STRINGS.cancel)}
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
                      placeholder={t("Search variables...")}
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
                          header: "Variable",
                          sortable: true,
                          render: (v) => (
                            <div class="font-mono">{v.var_name}</div>
                          ),
                        },
                        {
                          key: "example_values",
                          header: "Example Values",
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
                    selectionLabel="indicator"
                    bulkActions={[
                      {
                        label: t("Delete"),
                        intent: "danger",
                        onClick: (selectedIndicators) => {
                          const selectedVarNames = new Set(
                            selectedIndicators.map((ind) => ind.varName)
                          );
                          setTempIndicators(
                            tempIndicators.filter((ind) => !selectedVarNames.has(ind.varName))
                          );
                          setNeedsSaving(true);
                          return "CLEAR_SELECTION";
                        },
                      },
                    ]}
                    columns={[
                      {
                        key: "category",
                        header: t("Category"),
                        // sortable: true,
                      },
                      {
                        key: "definition",
                        header: t("Definition"),
                        // sortable: true,
                      },
                      {
                        key: "varName",
                        header: t("Variable Name"),
                        // sortable: true,
                      },
                      {
                        key: "type",
                        header: t("Type"),
                        render: (indicator) => (
                          <code class="font-mono text-xs">{indicator.type === "binary" ? "Boolean" : "Numeric"}</code>
                        ),
                      },
                      {
                        key: "rCode",
                        header: t("R Code"),
                        render: (indicator) => (
                          <code class="font-mono text-xs">{indicator.rCode}</code>
                        ),
                      },
                      {
                        key: "rFilterCode",
                        header: t("R Filter Code"),
                        render: (indicator) => (
                          <code class="font-mono text-xs">{indicator.rFilterCode}</code>
                        ),
                      },
                    ]}
                    groups={[
                      {
                        key: "category",
                        label: (items) =>
                          `${items[0].category} (${items.length} indicators)`,
                        groupBy: (item) => item.category,
                      },
                    ]}
                    currentGroup="category"
                    noRowsMessage={t("No indicators configured")}
                  /></EditorWrapper>
              </div>
            </FrameRightResizable>
          );
        }}
      </StateHolderWrapper>
    </FrameTop>
  );
}
