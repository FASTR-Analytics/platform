import { t, t2, T,
  type Dhis2Credentials,
  type DHIS2Indicator,
  type DHIS2DataElement } from "lib";
import {
  FrameTop,
  HeaderBarCanGoBack,
  Input,
  Button,
  Table,
  TableColumn,
  timActionForm,
  type EditorComponentProps,
  timActionButton,
} from "panther";
import { createSignal, Show, For } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = EditorComponentProps<
  {
    credentials: Dhis2Credentials;
    silentRefreshIndicators: () => Promise<void>;
  },
  undefined
>;

type SearchResult = {
  id: string;
  name: string;
  type: "indicator" | "dataElement";
  code?: string;
  shortName?: string;
};

export function Dhis2IndicatorSelectForm(p: Props) {
  // Form state
  const [tempSearchQuery, setTempSearchQuery] = createSignal<string>("");
  const [searchResults, setSearchResults] = createSignal<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = createSignal<boolean>(false);
  const [tempSelectedElements, setTempSelectedElements] = createSignal<
    SearchResult[]
  >([]);

  // Search action
  const search = timActionForm(async () => {
    const query = tempSearchQuery().trim();
    if (!query) {
      return { success: false, err: t("Search query is required") };
    }

    const response = await serverActions.searchDhis2All({
      dhis2Credentials: p.credentials,
      query,
      includeDataElements: true,
      includeIndicators: true,
    });

    if (!response.success) {
      return { success: false, err: response.err || t("Search failed") };
    }

    // Convert results to unified format - response.data now directly contains { dataElements, indicators }
    const results: SearchResult[] = [
      ...response.data.indicators.map((indicator: DHIS2Indicator) => ({
        id: indicator.id,
        name: indicator.name,
        type: "indicator" as const,
        code: indicator.code,
        shortName: indicator.shortName,
      })),
      ...response.data.dataElements.map((dataElement: DHIS2DataElement) => ({
        id: dataElement.id,
        name: dataElement.name,
        type: "dataElement" as const,
        code: dataElement.code,
        shortName: dataElement.shortName,
      })),
    ];

    setSearchResults(results);
    setHasSearched(true);
    return response;
  });

  // Save selected items action
  const save = timActionButton(
    async () => {
      const selectedItems = tempSelectedElements();
      if (selectedItems.length === 0) {
        return { success: false, err: t("No items selected") };
      }

      const newRawIndicators = selectedItems.map((item) => {
        return {
          indicator_raw_id: item.id,
          indicator_raw_label: item.name,
          mapped_common_ids: [],
        };
      });

      return await serverActions.createRawIndicators({
        indicators: newRawIndicators,
      });
    },
    p.silentRefreshIndicators,
    () => p.close(undefined),
  );

  // Selection helper functions
  function addToSelection(item: SearchResult) {
    const isAlreadySelected = tempSelectedElements().some(
      (selected) => selected.id === item.id,
    );
    if (!isAlreadySelected) {
      setTempSelectedElements((prev) => [...prev, item]);
    }
  }

  function removeFromSelection(itemId: string) {
    setTempSelectedElements((prev) =>
      prev.filter((item) => item.id !== itemId),
    );
  }

  function isItemSelected(itemId: string): boolean {
    return tempSelectedElements().some((item) => item.id === itemId);
  }

  // Table columns
  const columns: TableColumn<SearchResult>[] = [
    {
      key: "type",
      header: t("Type"),
      sortable: true,
      render: (item) => (
        <span
          class={`font-400 inline-block rounded px-2 py-1 text-xs ${
            item.type === "indicator"
              ? "bg-primary/10 text-primary"
              : "bg-success/10 text-success"
          }`}
        >
          {item.type === "indicator" ? t2(T.FRENCH_UI_STRINGS.indicator) : t("Data Element")}
        </span>
      ),
    },
    {
      key: "id",
      header: t("ID"),
      sortable: true,
      render: (item) => <span class="font-mono text-sm">{item.id}</span>,
    },
    {
      key: "name",
      header: t("Name"),
      sortable: true,
    },
    // {
    //   key: "code",
    //   header: t("Code"),
    //   sortable: true,
    //   render: (item) => (
    //     <span class="font-mono text-sm">{item.code || "-"}</span>
    //   ),
    // },
    // {
    //   key: "shortName",
    //   header: t("Short Name"),
    //   sortable: true,
    //   render: (item) => <span class="text-sm">{item.shortName || "-"}</span>,
    // },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (item) => (
        <Button
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            addToSelection(item);
          }}
          iconName="plus"
          intent="base-100"
          disabled={isItemSelected(item.id)}
        >
          {isItemSelected(item.id) ? t("Added") : t2(T.FRENCH_UI_STRINGS.add_1)}
        </Button>
      ),
    },
  ];

  return (
    <FrameTop
      panelChildren={
        <HeaderBarCanGoBack
          heading={t("DHIS2 Indicator Selection")}
          back={() => p.close(undefined)}
        >
          <Button
            onClick={save.click}
            state={save.state()}
            iconName="save"
            intent="success"
            disabled={tempSelectedElements().length === 0}
          >
            {t("Save Selected")} ({tempSelectedElements().length})
          </Button>
        </HeaderBarCanGoBack>
      }
    >
      <div class="flex h-full w-full">
        <div class="ui-pad ui-spy flex h-full w-0 flex-1 flex-col">
          {/* Search Section */}
          <div class="w-full flex-none">
            <div class="font-700 mb-4 text-lg">
              {t("Search Indicators & Data Elements")}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                search.click();
              }}
              class="ui-gap flex items-end justify-start"
            >
              <div class="w-96">
                <Input
                  value={tempSearchQuery()}
                  onChange={setTempSearchQuery}
                  placeholder={t("Enter search term...")}
                  label={t("Search Query")}
                  fullWidth
                />
              </div>
              <Button
                type="submit"
                state={search.state()}
                iconName="search"
                intent="primary"
              >
                {t2(T.FRENCH_UI_STRINGS.search)}
              </Button>
            </form>
          </div>

          {/* Results Section */}
          <Show when={hasSearched()}>
            <Show when={search.state().status === "ready"}>
              <div class="border-success bg-success/10 ui-pad-sm w-full flex-none rounded border">
                <div class="text-success font-700">
                  {t("Search completed:")} {searchResults().length}{" "}
                  {t("results found")}
                </div>
              </div>
            </Show>
            {/* <div class="border-base-300 bg-base-100 ui-pad flex h-0 flex-1 flex-col rounded border"> */}
            <Show
              when={searchResults().length > 0}
              fallback={
                <div class="border-base-300 bg-base-200 ui-pad rounded border text-center">
                  <div class="text-base-content">
                    {t("No results found. Try a different search term.")}
                  </div>
                </div>
              }
            >
              <div class="h-0 w-full flex-1">
                <Table
                  data={searchResults()}
                  columns={columns}
                  keyField="id"
                  noRowsMessage={t("No results")}
                  fitTableToAvailableHeight
                />
              </div>
            </Show>
            {/* </div> */}
          </Show>
        </div>
        <div class="ui-pad border-base-300 h-full w-0 flex-1 overflow-auto border-l">
          <div class="mb-4">
            <div class="font-700 text-lg">{t("Selected Items")}</div>
            <Show when={tempSelectedElements().length > 0}>
              <div class="text-base-content text-sm">
                {tempSelectedElements().length} {t("items selected")}
              </div>
            </Show>
          </div>
          <Show
            when={tempSelectedElements().length > 0}
            fallback={
              <div class="text-neutral text-sm">
                {t(
                  "No items selected. Search for items and click 'Add' from search results.",
                )}
              </div>
            }
          >
            <div class="ui-spy">
              <For each={tempSelectedElements()}>
                {(item) => (
                  <div class="border-base-300 ui-pad-sm ui-gap flex items-center justify-between rounded border">
                    <div class="flex-1">
                      <div class="font-700">{item.name}</div>
                      <div class="ui-gap-sm flex items-center text-sm">
                        <span
                          class={`font-400 inline-block rounded px-2 py-1 text-xs ${
                            item.type === "indicator"
                              ? "bg-primary/10 text-primary"
                              : "bg-success/10 text-success"
                          }`}
                        >
                          {item.type === "indicator"
                            ? t2(T.FRENCH_UI_STRINGS.indicator)
                            : t("Data Element")}
                        </span>
                        <span class="font-mono text-xs">{item.id}</span>
                      </div>
                    </div>
                    <Button
                      onClick={() => removeFromSelection(item.id)}
                      iconName="x"
                      intent="danger"
                      outline
                    >
                      {t("Remove")}
                    </Button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </FrameTop>
  );
}
