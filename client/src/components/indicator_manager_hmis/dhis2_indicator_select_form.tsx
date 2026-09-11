// Import from DHIS2 (PLAN_A3 rulings 6 and 8): search elements and
// indicators, refuse the ineligible ones in the list with the reason, then
// name what the selection becomes and save it in one transaction. An
// element or operand becomes a source; a DHIS2 indicator is decomposed into
// its operands (sources) and a derived over the bases they become. The
// server re-reads every element and indicator and judges them itself.
import {
  describeDhis2ParseRefusal,
  describeDhis2SourceRefusal,
  t3,
  type Dhis2DataElementSearchItem,
  type Dhis2IndicatorSearchItem,
  type Dhis2RunCredentialsSource,
  type DHIS2CategoryOptionCombo,
  type IndicatorWithSources,
} from "lib";
import {
  FrameTop,
  HeadingBar,
  TextArea,
  Button,
  StateHolderFormError,
  createFormAction,
  type EditorComponentProps,
  createButtonAction,
  openComponent,
} from "panther";
import { createMemo, createSignal, Show, For } from "solid-js";
import { createStore } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { Dhis2CredentialsForm } from "../forms_editors/dhis2_credentials_form";
import {
  createNamingState,
  namingInputFromState,
  namingIssues,
  NamingStep,
  type NamingDerivedCandidate,
  type NamingSourceCandidate,
  type NamingState,
} from "./_naming_step";

type Props = EditorComponentProps<
  {
    credentialsSource: Dhis2RunCredentialsSource;
  },
  undefined
>;

type SelectedItem =
  | { kind: "element"; element: Dhis2DataElementSearchItem }
  | {
    kind: "operand";
    element: Dhis2DataElementSearchItem;
    coc: DHIS2CategoryOptionCombo;
  }
  | { kind: "indicator"; indicator: Dhis2IndicatorSearchItem };

type SearchResults = {
  indicators: Dhis2IndicatorSearchItem[];
  dataElements: Dhis2DataElementSearchItem[];
};

function operandId(elementId: string, coc: DHIS2CategoryOptionCombo): string {
  return `${elementId}.${coc.id}`;
}

function cocName(coc: DHIS2CategoryOptionCombo): string {
  return coc.displayName || coc.name;
}

function operandLabel(
  element: { name: string },
  coc: DHIS2CategoryOptionCombo,
): string {
  return `${element.name} - ${cocName(coc)}`;
}

function itemId(item: SelectedItem): string {
  switch (item.kind) {
    case "element":
      return item.element.id;
    case "operand":
      return operandId(item.element.id, item.coc);
    case "indicator":
      return item.indicator.id;
  }
}

function itemName(item: SelectedItem): string {
  switch (item.kind) {
    case "element":
      return item.element.name;
    case "operand":
      return operandLabel(item.element, item.coc);
    case "indicator":
      return item.indicator.name;
  }
}

function elementRefusal(de: Dhis2DataElementSearchItem): string | undefined {
  if (de.verdict.accepted) return undefined;
  return `${t3({
    en: "Cannot be a source:",
    fr: "Ne peut pas être une source :",
    pt: "Não pode ser uma fonte:",
  })} ${t3(describeDhis2SourceRefusal(de.verdict.refusal))}`;
}

function indicatorRefusal(
  indicator: Dhis2IndicatorSearchItem,
): string | undefined {
  const { parse, operands } = indicator.decomposition;
  if (!parse.accepted) {
    return `${t3({
      en: "Cannot be decomposed:",
      fr: "Ne peut pas être décomposé :",
      pt: "Não pode ser decomposto:",
    })} ${t3(describeDhis2ParseRefusal(parse.refusal))}`;
  }
  const refused = operands.find((o) => !o.verdict.accepted);
  if (refused !== undefined && !refused.verdict.accepted) {
    return `${t3({
      en: `Operand ${refused.source_id} cannot be a source:`,
      fr: `L'opérande ${refused.source_id} ne peut pas être une source :`,
      pt: `O operando ${refused.source_id} não pode ser uma fonte:`,
    })} ${t3(describeDhis2SourceRefusal(refused.verdict.refusal))}`;
  }
  return undefined;
}

function kindLabel(kind: SelectedItem["kind"]): string {
  switch (kind) {
    case "indicator":
      return t3({ en: "Indicator", fr: "Indicateur", pt: "Indicador" });
    case "operand":
      return t3({ en: "Operand", fr: "Opérande", pt: "Operando" });
    case "element":
      return t3({
        en: "Data Element",
        fr: "Élément de données",
        pt: "Elemento de dados",
      });
  }
}

function kindClass(kind: SelectedItem["kind"]): string {
  switch (kind) {
    case "indicator":
      return "bg-primary-subtle text-primary-subtle-content";
    case "operand":
      return "bg-neutral-subtle text-neutral-subtle-content";
    case "element":
      return "bg-success-subtle text-success-subtle-content";
  }
}

export function Dhis2IndicatorSelectForm(p: Props) {
  const [credentialsSource, setCredentialsSource] = createSignal<Dhis2RunCredentialsSource>(
    p.credentialsSource,
  );
  const [tempSearchQuery, setTempSearchQuery] = createSignal<string>("");
  const [searchResults, setSearchResults] = createSignal<SearchResults>({
    indicators: [],
    dataElements: [],
  });
  const [hasSearched, setHasSearched] = createSignal<boolean>(false);
  const [selected, setSelected] = createSignal<SelectedItem[]>([]);
  const [expandedDataElements, setExpandedDataElements] = createSignal<
    Set<string>
  >(new Set());
  const [phase, setPhase] = createSignal<"select" | "name">("select");
  const [dictionary, setDictionary] = createSignal<IndicatorWithSources[]>([]);
  const [naming, setNaming] = createStore<NamingState>({
    sources: [],
    derived: [],
  });

  const search = createFormAction(async () => {
    const query = tempSearchQuery().trim();
    if (!query) {
      return {
        success: false,
        err: t3({
          en: "Search query is required",
          fr: "La requête de recherche est requise",
          pt: "O termo de pesquisa é obrigatório",
        }),
      };
    }

    const response = await serverActions.searchDhis2All({
      credentialsSource: credentialsSource(),
      query,
      includeDataElements: true,
      includeIndicators: true,
    });

    if (!response.success) {
      return {
        success: false,
        err:
          response.err ||
          t3({ en: "Search failed", fr: "Échec de la recherche", pt: "Falha na pesquisa" }),
      };
    }

    setSearchResults({
      indicators: response.data.indicators,
      dataElements: response.data.dataElements,
    });
    setHasSearched(true);
    return response;
  });

  // Every operand of a selected indicator is a candidate source too. Its
  // label comes from the element (with the COC's name for an operand); an
  // element the search did not return is looked up by id first.
  async function operandLabels(
    ids: string[],
  ): Promise<Map<string, string>> {
    const elements = new Map(
      searchResults().dataElements.map((de) => [de.id, de]),
    );
    const missing = [
      ...new Set(
        ids.map((id) => id.split(".")[0]).filter((id) => !elements.has(id)),
      ),
    ];
    if (missing.length > 0) {
      const res = await serverActions.searchDhis2All({
        credentialsSource: credentialsSource(),
        query: missing.join(","),
        includeDataElements: true,
        includeIndicators: false,
      });
      if (res.success) {
        for (const de of res.data.dataElements) elements.set(de.id, de);
      }
    }
    const labels = new Map<string, string>();
    for (const id of ids) {
      const [elementId, cocId] = id.split(".");
      const element = elements.get(elementId);
      if (element === undefined) {
        labels.set(id, id);
        continue;
      }
      const coc = cocId === undefined
        ? undefined
        : element.categoryCombo?.categoryOptionCombos?.find((c) => c.id === cocId);
      labels.set(
        id,
        coc === undefined
          ? (cocId === undefined ? element.name : `${element.name} - ${cocId}`)
          : operandLabel(element, coc),
      );
    }
    return labels;
  }

  const toNaming = createFormAction(async () => {
    const items = selected();
    if (items.length === 0) {
      return {
        success: false,
        err: t3({ en: "No items selected", fr: "Aucun élément sélectionné", pt: "Nenhum elemento selecionado" }),
      };
    }
    const dictionaryRes = await serverActions.getIndicators({});
    if (!dictionaryRes.success) {
      return dictionaryRes;
    }
    const sources = new Map<string, NamingSourceCandidate>();
    const operandIds: string[] = [];
    const derived: NamingDerivedCandidate[] = [];
    for (const item of items) {
      if (item.kind !== "indicator") {
        sources.set(itemId(item), {
          source_id: itemId(item),
          source_label: itemName(item),
        });
        continue;
      }
      const { parse, operands } = item.indicator.decomposition;
      if (!parse.accepted) continue;
      for (const operand of operands) operandIds.push(operand.source_id);
      derived.push({
        key: item.indicator.id,
        label: item.indicator.name,
        expression: parse.expression,
        format_as: parse.format_as,
        note: parse.note === undefined ? undefined : t3(parse.note),
      });
    }
    const labels = await operandLabels(
      operandIds.filter((id) => !sources.has(id)),
    );
    for (const id of operandIds) {
      if (!sources.has(id)) {
        sources.set(id, { source_id: id, source_label: labels.get(id) ?? id });
      }
    }
    setDictionary(dictionaryRes.data.indicators);
    setNaming(
      createNamingState({
        sources: [...sources.values()],
        derived,
        indicators: dictionaryRes.data.indicators,
      }),
    );
    setPhase("name");
    return { success: true };
  });

  const issues = createMemo(() =>
    phase() === "name" ? namingIssues(naming, dictionary()) : []
  );

  const save = createButtonAction(
    async () => {
      return await serverActions.createIndicatorsFromDhis2({
        credentialsSource: credentialsSource(),
        sources: namingInputFromState(naming).sources,
        indicators: naming.derived.map((row) => ({
          dhis2_id: row.key,
          indicator_id: row.indicator_id.trim(),
          label: row.label.trim(),
        })),
      });
    },
    () => p.close(undefined),
  );

  function addToSelection(item: SelectedItem) {
    const id = itemId(item);
    if (!selected().some((s) => itemId(s) === id)) {
      setSelected((prev) => [...prev, item]);
    }
  }

  function removeFromSelection(id: string) {
    setSelected((prev) => prev.filter((item) => itemId(item) !== id));
  }

  function isItemSelected(id: string): boolean {
    return selected().some((item) => itemId(item) === id);
  }

  function toggleExpanded(dataElementId: string) {
    setExpandedDataElements((prev) => {
      const next = new Set(prev);
      if (next.has(dataElementId)) {
        next.delete(dataElementId);
      } else {
        next.add(dataElementId);
      }
      return next;
    });
  }

  function isExpanded(dataElementId: string): boolean {
    return expandedDataElements().has(dataElementId);
  }

  function hasDisaggregation(de: Dhis2DataElementSearchItem): boolean {
    return (
      de.categoryCombo?.isDefault !== true &&
      (de.categoryCombo?.categoryOptionCombos?.length ?? 0) > 0
    );
  }

  function getCOCs(de: Dhis2DataElementSearchItem): DHIS2CategoryOptionCombo[] {
    return de.categoryCombo?.categoryOptionCombos ?? [];
  }

  function totalResultCount(): number {
    return (
      searchResults().indicators.length + searchResults().dataElements.length
    );
  }

  async function changeConnection() {
    const result = await openComponent({ element: Dhis2CredentialsForm, props: {} });
    if (!result) return;
    setCredentialsSource({ kind: "inline", credentials: result.credentials });
  }

  function addButton(item: SelectedItem, refusal: string | undefined) {
    const id = itemId(item);
    return (
      <Button
        onClick={() => addToSelection(item)}
        iconName="plus"
        intent="base-100"
        disabled={isItemSelected(id) || refusal !== undefined}
      >
        {isItemSelected(id)
          ? t3({ en: "Added", fr: "Ajouté", pt: "Adicionado" })
          : t3({ en: "Add", fr: "Ajouter", pt: "Adicionar" })}
      </Button>
    );
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          tonal
          heading={phase() === "select"
            ? t3({
              en: "DHIS2 Indicator Selection",
              fr: "Sélection d'indicateurs DHIS2",
              pt: "Seleção de indicadores DHIS2",
            })
            : t3({
              en: "Name the new indicators",
              fr: "Nommer les nouveaux indicateurs",
              pt: "Nomear os novos indicadores",
            })}
          onBack={() => phase() === "select" ? p.close(undefined) : setPhase("select")}
        >
          <Show
            when={phase() === "select"}
            fallback={
              <Button
                onClick={save.click}
                state={save.state()}
                iconName="save"
                intent="success"
                disabled={issues().length > 0}
              >
                {t3({ en: "Save", fr: "Enregistrer", pt: "Guardar" })}
              </Button>
            }
          >
            <Button onClick={changeConnection} outline onBackground="base-200" iconName="settings">
              {t3({ en: "Change connection", fr: "Modifier la connexion", pt: "Alterar a ligação" })}
            </Button>
            <Button
              onClick={toNaming.click}
              state={toNaming.state()}
              iconName="arrowRight"
              intent="primary"
              disabled={selected().length === 0}
            >
              {t3({ en: "Next: name indicators", fr: "Suivant : nommer les indicateurs", pt: "Seguinte: nomear indicadores" })} (
              {selected().length})
            </Button>
          </Show>
        </HeadingBar>
      }
    >
      <Show when={phase() === "name"}>
        <div class="ui-pad h-full w-full overflow-auto">
          <div class="mx-auto max-w-5xl">
            <NamingStep state={naming} setState={setNaming} indicators={dictionary()} />
          </div>
        </div>
      </Show>
      <Show when={phase() === "select"}>
      <div class="flex h-full w-full">
        <div class="ui-pad ui-spy flex h-full w-0 flex-1 flex-col">
          {/* Search Section */}
          <div class="w-full flex-none">
            <div class="font-700 mb-4 text-lg">
              {t3({
                en: "Search Indicators & Data Elements",
                fr: "Rechercher des indicateurs et éléments de données",
                pt: "Pesquisar indicadores e elementos de dados",
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
                    pt: "p. ex. Cuidados pré-natais (pesquisa «Cuidados pré-natais» como um único termo)\np. ex. BFeLG7TNOvq, CKCRDq0NBHy (pesquisa dois IDs e combina os resultados)\n\nUtilize vírgulas, pontos e vírgulas ou novas linhas para pesquisar vários termos de uma só vez.",
                  })}
                  label={t3({
                    en: "Search by name, code, or ID",
                    fr: "Rechercher par nom, code ou ID",
                    pt: "Pesquisar por nome, código ou ID",
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
                  {t3({ en: "Search", fr: "Recherche", pt: "Pesquisar" })}
                </Button>
                <Show when={tempSearchQuery().trim().length > 0}>
                  <Button
                    onClick={() => setTempSearchQuery("")}
                    iconName="x"
                    intent="neutral"
                    outline
                  >
                    {t3({ en: "Clear", fr: "Effacer", pt: "Limpar" })}
                  </Button>
                </Show>
              </div>
            </form>
            <StateHolderFormError state={search.state()} />
          </div>

          {/* Results Section */}
          <Show when={hasSearched()}>
            <Show when={search.state().status === "ready"}>
              <div class="border-success bg-success-subtle ui-pad-sm w-full flex-none rounded border">
                <div class="text-success font-700">
                  {t3({ en: "Search completed:", fr: "Recherche terminée :", pt: "Pesquisa concluída:" })}{" "}
                  {totalResultCount()}{" "}
                  {t3({ en: "results found", fr: "résultats trouvés", pt: "resultados encontrados" })}
                </div>
              </div>
            </Show>
            <Show
              when={totalResultCount() > 0}
              fallback={
                <div class="bg-base-200 ui-pad rounded border text-center">
                  <div class="text-base-content">
                    {t3({
                      en: "No results found. Try a different search term.",
                      fr: "Aucun résultat trouvé. Essayez un autre terme de recherche.",
                      pt: "Nenhum resultado encontrado. Experimente outro termo de pesquisa.",
                    })}
                  </div>
                </div>
              }
            >
              <div class="h-0 w-full flex-1 overflow-auto">
                <div class="ui-spy-sm">
                  {/* Indicators */}
                  <For each={searchResults().indicators}>
                    {(indicator) => {
                      const refusal = indicatorRefusal(indicator);
                      return (
                        <div class="ui-pad-sm rounded border">
                          <div class="flex items-center gap-2">
                            <span class={`${kindClass("indicator")} font-400 inline-block flex-none rounded px-2 py-1 text-xs`}>
                              {kindLabel("indicator")}
                            </span>
                            <span class="font-700 flex-1 truncate">
                              {indicator.name}
                            </span>
                            <span class="text-base-content flex-none font-mono text-xs">
                              {indicator.id}
                            </span>
                            {addButton({ kind: "indicator", indicator }, refusal)}
                          </div>
                          <Show
                            when={refusal}
                            fallback={
                              <div class="text-base-content-muted mt-1 font-mono text-xs">
                                {indicator.numerator} / {indicator.denominator}
                              </div>
                            }
                          >
                            {(text) => <div class="text-danger mt-1 text-xs">{text()}</div>}
                          </Show>
                        </div>
                      );
                    }}
                  </For>

                  {/* Data Elements */}
                  <For each={searchResults().dataElements}>
                    {(de) => {
                      const refusal = elementRefusal(de);
                      return (
                        <div class="rounded border">
                          {/* Data Element row */}
                          <div class="ui-pad-sm">
                            <div class="flex items-center gap-2">
                              <Show when={hasDisaggregation(de)}>
                                <Button
                                  onClick={() => toggleExpanded(de.id)}
                                  iconName={
                                    isExpanded(de.id)
                                      ? "chevronDown"
                                      : "chevronRight"
                                  }
                                  intent="neutral"
                                  outline
                                />
                              </Show>
                              <span class={`${kindClass("element")} font-400 inline-block flex-none rounded px-2 py-1 text-xs`}>
                                {kindLabel("element")}
                              </span>
                              <span class="font-700 flex-1 truncate">
                                {de.name}
                              </span>
                              <Show when={hasDisaggregation(de)}>
                                <span class="bg-warning-subtle text-warning-subtle-content flex-none rounded px-2 py-0.5 text-xs">
                                  {getCOCs(de).length}{" "}
                                  {t3({
                                    en: "COCs",
                                    fr: "COCs",
                                    pt: "COCs",
                                  })}
                                </span>
                              </Show>
                              <span class="text-base-content flex-none font-mono text-xs">
                                {de.id}
                              </span>
                              {addButton({ kind: "element", element: de }, refusal)}
                            </div>
                            <Show when={refusal}>
                              {(text) => <div class="text-danger mt-1 text-xs">{text()}</div>}
                            </Show>
                          </div>

                          {/* Expanded COCs */}
                          <Show when={hasDisaggregation(de) && isExpanded(de.id)}>
                            <div class="bg-base-200 border-t">
                              <For each={getCOCs(de)}>
                                {(coc) => (
                                  <div class="border-base-200 ui-pad-sm flex items-center gap-2 border-b pl-10 last:border-b-0">
                                    <span class="bg-neutral-subtle text-neutral-subtle-content font-400 inline-block flex-none rounded px-2 py-1 text-xs">
                                      {t3({ en: "COC", fr: "COC", pt: "COC" })}
                                    </span>
                                    <span class="font-400 flex-1 truncate">
                                      {cocName(coc)}
                                    </span>
                                    <span class="text-base-content flex-none font-mono text-xs">
                                      {operandId(de.id, coc)}
                                    </span>
                                    {addButton({ kind: "operand", element: de, coc }, refusal)}
                                  </div>
                                )}
                              </For>
                            </div>
                          </Show>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            </Show>
          </Show>
        </div>

        {/* Selected Items Panel */}
        <div class="ui-pad h-full w-0 flex-1 overflow-auto border-l">
          <div class="mb-4">
            <div class="font-700 text-lg">
              {t3({ en: "Selected Items", fr: "Éléments sélectionnés", pt: "Elementos selecionados" })}
            </div>
            <Show when={selected().length > 0}>
              <div class="text-base-content text-sm">
                {selected().length}{" "}
                {t3({ en: "items selected", fr: "éléments sélectionnés", pt: "elementos selecionados" })}
              </div>
            </Show>
          </div>
          <Show
            when={selected().length > 0}
            fallback={
              <div class="text-base-content-muted text-sm">
                {t3({
                  en: "No items selected. Search for items and click 'Add' from search results.",
                  fr: "Aucun élément sélectionné. Recherchez des éléments et cliquez sur « Ajouter » dans les résultats.",
                  pt: "Nenhum elemento selecionado. Pesquise elementos e clique em «Adicionar» nos resultados.",
                })}
              </div>
            }
          >
            <div class="ui-spy">
              <For each={selected()}>
                {(item) => (
                  <div class="ui-pad-sm ui-gap flex items-center justify-between rounded border">
                    <div class="flex-1">
                      <div class="font-700">{itemName(item)}</div>
                      <div class="ui-gap-sm flex items-center text-sm">
                        <span class={`font-400 inline-block rounded px-2 py-1 text-xs ${kindClass(item.kind)}`}>
                          {kindLabel(item.kind)}
                        </span>
                        <span class="font-mono text-xs">{itemId(item)}</span>
                      </div>
                    </div>
                    <Button
                      onClick={() => removeFromSelection(itemId(item))}
                      iconName="x"
                      intent="danger"
                      outline
                    >
                      {t3({ en: "Remove", fr: "Retirer", pt: "Remover" })}
                    </Button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
      </Show>
      <StateHolderFormError state={toNaming.state()} />
    </FrameTop>
  );
}
