import {
  t3,
  type Dhis2Credentials,
  type DHIS2Indicator,
  type DHIS2DataElement,
} from "lib";
import {
  FrameTop,
  HeaderBarCanGoBack,
  TextArea,
  Button,
  Table,
  TableColumn,
  StateHolderFormError,
  timActionForm,
  type EditorComponentProps,
  timActionButton,
} from "panther";
import { createSignal, Show, For } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = EditorComponentProps<
  {
    credentials: Dhis2Credentials;
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
      return {
        success: false,
        err: t3({
          en: "Search query is required",
          fr: "La requête de recherche est requise",
        }),
      };
    }

    const response = await serverActions.searchDhis2All({
      dhis2Credentials: p.credentials,
      query,
      includeDataElements: true,
      includeIndicators: true,
    });

    if (!response.success) {
      return {
        success: false,
        err:
          response.err ||
          t3({ en: "Search failed", fr: "Échec de la recherche" }),
      };
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
        return {
          success: false,
          err: t3({ en: "No items selected", fr: "Aucun élément sélectionné" }),
        };
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
      header: t3({ en: "Type", fr: "Type" }),
      sortable: true,
      render: (item) => (
        <span
          class={`font-400 inline-block rounded px-2 py-1 text-xs ${
            item.type === "indicator"
              ? "bg-primary/10 text-primary"
              : "bg-success/10 text-success"
          }`}
        >
          {item.type === "indicator"
            ? t3({ en: "Indicator", fr: "Indicateur" })
            : t3({ en: "Data Element", fr: "Élément de données" })}
        </span>
      ),
    },
    {
      key: "id",
      header: t3({ en: "ID", fr: "ID" }),
      sortable: true,
      render: (item) => <span class="font-mono text-sm">{item.id}</span>,
    },
    {
      key: "name",
      header: t3({ en: "Name", fr: "Nom" }),
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
      alignH: "right",
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
          {isItemSelected(item.id)
            ? t3({ en: "Added", fr: "Ajouté" })
            : t3({ en: "Add", fr: "Ajouter" })}
        </Button>
      ),
    },
  ];

  return (
    <FrameTop
      panelChildren={
        <HeaderBarCanGoBack
          heading={t3({
            en: "DHIS2 Indicator Selection",
            fr: "Sélection d'indicateurs DHIS2",
          })}
          back={() => p.close(undefined)}
        >
          <Button
            onClick={save.click}
            state={save.state()}
            iconName="save"
            intent="success"
            disabled={tempSelectedElements().length === 0}
          >
            {t3({ en: "Save Selected", fr: "Enregistrer la sélection" })} (
            {tempSelectedElements().length})
          </Button>
        </HeaderBarCanGoBack>
      }
    >
      <div class="flex h-full w-full">
        <div class="ui-pad ui-spy flex h-full w-0 flex-1 flex-col">
          {/* Search Section */}
          <div class="w-full flex-none">
            <div class="font-700 mb-4 text-lg">
              {t3({
                en: "Search Indicators & Data Elements",
                fr: "Rechercher des indicateurs et éléments de données",
              })}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                search.click();
              }}
              class="ui-gap flex items-end justify-start"
            >
              <div class="w-0 flex-1">
                <TextArea
                  value={tempSearchQuery()}
                  onChange={setTempSearchQuery}
                  placeholder={t3({
                    en: 'e.g. Antenatal care (searches for "Antenatal care" as one term)\ne.g. BFeLG7TNOvq, CKCRDq0NBHy (searches for two IDs and combines results)\n\nUse commas, semicolons, or new lines to search multiple terms at once.',
                    fr: "ex. Soins prénatals (recherche « Soins prénatals » comme un seul terme)\nex. BFeLG7TNOvq, CKCRDq0NBHy (recherche deux ID et combine les résultats)\n\nUtilisez des virgules, points-virgules ou retours à la ligne pour rechercher plusieurs termes.",
                  })}
                  label={t3({
                    en: "Search by name, code, or ID",
                    fr: "Rechercher par nom, code ou ID",
                  })}
                  rows={5}
                  fullWidth
                />
              </div>
              <div class="ui-gap-sm flex flex-col">
                <Button
                  type="submit"
                  state={search.state()}
                  iconName="search"
                  intent="primary"
                >
                  {t3({ en: "Search", fr: "Recherche" })}
                </Button>
                <Show when={tempSearchQuery().trim().length > 0}>
                  <Button
                    onClick={() => setTempSearchQuery("")}
                    iconName="x"
                    intent="neutral"
                    outline
                  >
                    {t3({ en: "Clear", fr: "Effacer" })}
                  </Button>
                </Show>
              </div>
            </form>
            <StateHolderFormError state={search.state()} />
          </div>

          {/* Results Section */}
          <Show when={hasSearched()}>
            <Show when={search.state().status === "ready"}>
              <div class="border-success bg-success/10 ui-pad-sm w-full flex-none rounded border">
                <div class="text-success font-700">
                  {t3({ en: "Search completed:", fr: "Recherche terminée :" })}{" "}
                  {searchResults().length}{" "}
                  {t3({ en: "results found", fr: "résultats trouvés" })}
                </div>
              </div>
            </Show>
            {/* <div class="border-base-300 bg-base-100 ui-pad flex h-0 flex-1 flex-col rounded border"> */}
            <Show
              when={searchResults().length > 0}
              fallback={
                <div class="border-base-300 bg-base-200 ui-pad rounded border text-center">
                  <div class="text-base-content">
                    {t3({
                      en: "No results found. Try a different search term.",
                      fr: "Aucun résultat trouvé. Essayez un autre terme de recherche.",
                    })}
                  </div>
                </div>
              }
            >
              <div class="h-0 w-full flex-1">
                <Table
                  data={searchResults()}
                  columns={columns}
                  keyField="id"
                  noRowsMessage={t3({ en: "No results", fr: "Aucun résultat" })}
                  fitTableToAvailableHeight
                />
              </div>
            </Show>
            {/* </div> */}
          </Show>
        </div>
        <div class="ui-pad border-base-300 h-full w-0 flex-1 overflow-auto border-l">
          <div class="mb-4">
            <div class="font-700 text-lg">
              {t3({ en: "Selected Items", fr: "Éléments sélectionnés" })}
            </div>
            <Show when={tempSelectedElements().length > 0}>
              <div class="text-base-content text-sm">
                {tempSelectedElements().length}{" "}
                {t3({ en: "items selected", fr: "éléments sélectionnés" })}
              </div>
            </Show>
          </div>
          <Show
            when={tempSelectedElements().length > 0}
            fallback={
              <div class="text-neutral text-sm">
                {t3({
                  en: "No items selected. Search for items and click 'Add' from search results.",
                  fr: "Aucun élément sélectionné. Recherchez des éléments et cliquez sur « Ajouter » dans les résultats.",
                })}
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
                            ? t3({ en: "Indicator", fr: "Indicateur" })
                            : t3({
                                en: "Data Element",
                                fr: "Élément de données",
                              })}
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
                      {t3({ en: "Remove", fr: "Retirer" })}
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
