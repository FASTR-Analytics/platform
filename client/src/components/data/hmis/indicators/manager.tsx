import {
  analysedIdsWithData,
  t3,
  TC,
  INDICATOR_DOWNLOAD_FILE_COLUMNS,
  INDICATOR_DOWNLOAD_MEMBERS_SEPARATOR,
  type HmisIndicator,
  type InstanceIndicatorDetails,
  isSpecialIndicatorId,
  judgeCalculatedIndicators,
  NO_STORED_DHIS2_CONNECTION,
  POPULATION_TYPE_IDS,
  populationTypeLabel,
  RESERVED_WORDS,
  SPECIAL_INDICATORS,
} from "lib";
import {
  AlertComponentProps,
  Button,
  Callout,
  FrameTop,
  HeadingBar,
  Icon,
  Input,
  ActionMenuButton,
  ModalContainer,
  getQueryStateFromApiResponse,
  StateHolderWrapper,
  Table,
  TableColumn,
  getEditorWrapper,
  openComponent,
  openAlert,
  createButtonAction,
  createDeleteAction,
  createQuery,
  type BulkAction,
  type MenuItem,
  type StateHolder,
} from "panther";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
} from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { getIndicatorsFromCacheOrFetch } from "~/state/instance/t2_indicators";
import {
  DHIS2_DATA_IMPORT_TITLE,
  Dhis2Wizard,
  type Dhis2WizardResult,
} from "~/components/data/hmis/imports/mod.ts";
import {
  computabilityProblemText,
  missingPopulationText,
} from "./computability";
import { EditIndicatorForm } from "./edit_indicator_form";
import {
  definedByText,
  dhis2LabelOf,
  indicatorTypeLabel,
  matchesIndicatorSearch,
} from "~/components/data/hmis/_shared/mod.ts";
import { Dhis2IndicatorSelectForm } from "./dhis2_indicator_select_form";
import { SortIndicatorsModal } from "./sort_indicators_modal";
import { SpecialBadge } from "./special_badge";
import { IndicatorTypeBadge } from "~/components/data/hmis/_shared/mod.ts";
import { WrapOnUnderscore } from "~/components/data/hmis/_shared/mod.ts";
import { IndicatorTypesModal } from "./type_facts";
import { RefreshDhis2LabelsModal } from "./refresh_dhis2_labels_modal";

type Props = {
  close: (v: undefined) => void;
};

// The dictionary as one list (PLAN_A4 §2): every row is an indicator, the
// Type column says what fills it (DHIS2 element, Uploaded, Sum, Calculated),
// and a special indicator (one the analysis modules read by name) carries
// a badge. Every field, including include-in-analysis, is edited in the
// modal.
export function IndicatorsManager(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [indicators, setIndicators] = createSignal<
    StateHolder<InstanceIndicatorDetails>
  >({
    status: "loading",
    msg: t3({
      en: "Loading indicators...",
      fr: "Chargement des indicateurs...",
      pt: "A carregar os indicadores...",
    }),
  });

  let indicatorsRequestId = 0;
  createEffect(async () => {
    const version = instanceState.indicatorsVersion;
    if (!version) {
      return;
    }
    const requestId = ++indicatorsRequestId;
    setIndicators({ status: "loading" });
    const res = await getIndicatorsFromCacheOrFetch(version);
    if (requestId !== indicatorsRequestId) {
      return;
    }
    setIndicators(getQueryStateFromApiResponse(res));
  });

  // Which data ids have rows, for the computability status: the ledger is
  // the cheap answer (one row per data id × month), re-read when an import
  // mints a new data version. A display-only enrichment: the list renders
  // without it and the status column fills in when it arrives.
  const ledger = createQuery(() =>
    serverActions.getDatasetHmisImportLedger({}),
  );
  createEffect(
    on(
      () => instanceState.datasetVersions.hmis,
      () => void ledger.silentFetch(),
      { defer: true },
    ),
  );
  const idsWithRows = createMemo<Set<string> | undefined>(() => {
    const s = ledger.state();
    if (s.status !== "ready") return undefined;
    return new Set(
      s.data.filter((item) => item.nRecords > 0).map((item) => item.dataId),
    );
  });

  // The dictionary download (PLAN_A6 ruling 8): the DHIS2 id of an element,
  // blank for every other type.
  function handleDownloadCsv(list: HmisIndicator[]) {
    const rows = list.map((indicator) => [
      indicator.indicator_common_id,
      indicator.indicator_common_label,
      indicator.definition.type,
      indicator.definition.type === "dhis2_element"
        ? indicator.definition.data_id
        : "",
      dhis2LabelOf(indicator) ?? "",
      indicator.definition.type === "sum"
        ? indicator.definition.members.join(
            INDICATOR_DOWNLOAD_MEMBERS_SEPARATOR,
          )
        : "",
      indicator.definition.type === "calculated"
        ? indicator.definition.expression
        : "",
      String(indicator.include_in_analysis),
      indicator.format_as,
      indicator.thresholds ? JSON.stringify(indicator.thresholds) : "",
      indicator.direction,
      indicator.target === null ? "" : String(indicator.target),
      String(indicator.expected_low_counts),
    ]);

    const csvContent = [
      INDICATOR_DOWNLOAD_FILE_COLUMNS.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "indicators.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleDhis2IndicatorSelect() {
    if (!instanceState.dhis2ConnectionUrl) {
      await openAlert({ text: t3(NO_STORED_DHIS2_CONNECTION) });
      return;
    }
    await openEditor({ element: Dhis2IndicatorSelectForm, props: {} });
  }

  // The DHIS2 name refresh, a maintenance action in the toolbar's overflow
  // menu: the modal explains it, runs it and reports it.
  async function handleRefreshDhis2Labels(indicators: HmisIndicator[]) {
    if (!instanceState.dhis2ConnectionUrl) {
      await openAlert({ text: t3(NO_STORED_DHIS2_CONNECTION) });
      return;
    }
    await openComponent({
      element: RefreshDhis2LabelsModal,
      props: {
        elementCount: indicators.filter((i) => i.definition.type === "dhis2_element").length,
      },
    });
  }

  async function handleTypes() {
    await openComponent({ element: IndicatorTypesModal, props: {} });
  }

  async function handleReference() {
    await openComponent({ element: ReferenceListModal, props: {} });
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            onBack={() => p.close(undefined)}
            heading={t3({
              en: "HMIS INDICATORS",
              fr: "INDICATEURS",
              pt: "INDICADORES",
            })}
          >
            <div class="ui-gap-sm flex items-center">
              <Button
                iconName="info"
                onClick={handleTypes}
                outline
              >
                {t3({
                  en: "Indicator types",
                  fr: "Types d'indicateurs",
                  pt: "Tipos de indicadores",
                })}
              </Button>
              <Button
                iconName="info"
                onClick={handleReference}
                outline
              >
                {t3({
                  en: "Special indicators and reserved words",
                  fr: "Indicateurs spéciaux et mots réservés",
                  pt: "Indicadores especiais e palavras reservadas",
                })}
              </Button>
            </div>
          </HeadingBar>
        }
      >
        <div class="ui-pad ui-spy h-full w-full overflow-auto">
          <StateHolderWrapper state={indicators()} noPad>
            {(keyedIndicators) => (
              <div class="h-full">
                <IndicatorsTable
                  indicators={keyedIndicators.indicators}
                  idsWithRows={idsWithRows()}
                  handleDownloadCsv={handleDownloadCsv}
                  handleDhis2IndicatorSelect={handleDhis2IndicatorSelect}
                  handleRefreshDhis2Labels={handleRefreshDhis2Labels}
                />
              </div>
            )}
          </StateHolderWrapper>
        </div>
      </FrameTop>
    </EditorWrapper>
  );
}

type IndicatorStatus = {
  problem: string | undefined;
  population: string | undefined;
};

// The occasional actions, off the toolbar so they are not taken for daily
// ones: the dictionary download and the DHIS2 name refresh.
function otherActionItems(p: {
  onDownload: () => void;
  onRefreshDhis2Labels: () => void;
}): MenuItem[] {
  return [
    {
      label: t3({ en: "Download", fr: "Télécharger", pt: "Transferir" }),
      icon: "download",
      onClick: p.onDownload,
    },
    {
      label: t3({
        en: "Refresh DHIS2 names",
        fr: "Actualiser les noms DHIS2",
        pt: "Atualizar nomes DHIS2",
      }),
      icon: "refresh",
      onClick: p.onRefreshDhis2Labels,
    },
  ];
}

function IndicatorsTable(p: {
  indicators: HmisIndicator[];
  idsWithRows: Set<string> | undefined;
  handleDownloadCsv: (indicators: HmisIndicator[]) => void;
  handleDhis2IndicatorSelect: () => void;
  handleRefreshDhis2Labels: (indicators: HmisIndicator[]) => void;
}) {
  // The counts the extract could produce values for: an Uploaded or DHIS2
  // element by the rows under its data id, a sum by any member's. Over
  // every count rather than the analysed set, so an unchecked calculated is
  // judged as it would be if it were checked.
  const idsWithData = createMemo<Set<string> | undefined>(() => {
    const rows = p.idsWithRows;
    if (rows === undefined) return undefined;
    return analysedIdsWithData(
      p.indicators,
      new Set(
        p.indicators
          .filter((c) => c.definition.type !== "calculated")
          .map((c) => c.indicator_common_id),
      ),
      rows,
    );
  });

  // The same judgement capture makes, over the dictionary the list shows.
  // Counts have no status: one without data is the ordinary case.
  const statuses = createMemo(() => {
    const statuses = new Map<string, IndicatorStatus>();
    const withData = idsWithData();
    if (withData === undefined) return statuses;
    const judgements = judgeCalculatedIndicators(
      p.indicators,
      POPULATION_TYPE_IDS,
      withData,
    );
    for (const [id, judgement] of judgements) {
      statuses.set(id, {
        problem:
          judgement.kind === "computable"
            ? undefined
            : computabilityProblemText(judgement),
        population:
          judgement.kind === "unresolvable"
            ? undefined
            : missingPopulationText(
                judgement.resolved,
                instanceState.populationCoverage,
              ),
      });
    }
    return statuses;
  });
  const statusOf = (indicator: HmisIndicator) =>
    statuses().get(indicator.indicator_common_id);

  const [search, setSearch] = createSignal("");
  const visibleIndicators = createMemo(() =>
    p.indicators.filter((i) => matchesIndicatorSearch(i, search())),
  );
  const uncomputableCount = createMemo(
    () =>
      [...statuses().values()].filter((s) => s.problem !== undefined).length,
  );

  async function handleCreateIndicator() {
    await openComponent({
      element: EditIndicatorForm,
      props: { indicators: p.indicators, idsWithData: idsWithData() },
    });
  }

  async function handleUpdateIndicator(indicator: HmisIndicator) {
    await openComponent({
      element: EditIndicatorForm,
      props: {
        indicators: p.indicators,
        idsWithData: idsWithData(),
        existingIndicator: indicator,
      },
    });
  }

  async function handleSortIndicators() {
    await openComponent({
      element: SortIndicatorsModal,
      props: { indicators: p.indicators },
    });
  }

  const otherActions = () =>
    otherActionItems({
      onDownload: () => p.handleDownloadCsv(p.indicators),
      onRefreshDhis2Labels: () => p.handleRefreshDhis2Labels(p.indicators),
    });

  // The DHIS2 data import for the rows in front of you (PLAN_A7 ruling 11):
  // the same wizard the imports view opens, preselected with the selection,
  // fetching its own data. It launches, queues or schedules as it does
  // there; the notice says where to follow the run.
  const [importNotice, setImportNotice] = createSignal<
    Dhis2WizardResult | undefined
  >(undefined);
  async function handleImportFromDhis2(selected: HmisIndicator[]) {
    const res = await openComponent({
      element: Dhis2Wizard,
      props: {
        entry: {
          kind: "new",
          indicatorIds: selected.map((i) => i.indicator_common_id),
        },
      },
    });
    if (!res) return;
    setImportNotice(res);
    return "CLEAR_SELECTION";
  }

  function importNoticeText(result: Dhis2WizardResult): string {
    return result.landedTab === "current"
      ? t3({
          en: "The import has been started. Follow it under HMIS data, Imports, Current.",
          fr: "L'importation a été lancée. Suivez-la sous Données HMIS, Importations, En cours.",
          pt: "A importação foi iniciada. Acompanhe-a em Dados HMIS, Importações, Atual.",
        })
      : t3({
          en: "The import has been scheduled. Follow it under HMIS data, Imports, Future.",
          fr: "L'importation a été planifiée. Suivez-la sous Données HMIS, Importations, À venir.",
          pt: "A importação foi agendada. Acompanhe-a em Dados HMIS, Importações, Futuro.",
        });
  }

  // The flag over the selected rows; the list refreshes through the
  // indicatorsVersion push. A special cannot be excluded, and the server
  // refuses the whole action naming it, so the user sees which row blocked.
  const setIncludeInAnalysis = createButtonAction(
    (selected: HmisIndicator[], include: boolean) =>
      serverActions.setIndicatorsIncludeInAnalysis({
        indicator_common_ids: selected.map((i) => i.indicator_common_id),
        include_in_analysis: include,
      }),
  );

  async function handleDeleteIndicators(selected: HmisIndicator[]) {
    const indicatorIds = selected.map((i) => i.indicator_common_id);
    const deleteAction = createDeleteAction(
      {
        text:
          indicatorIds.length === 1
            ? t3({
                en: "Are you sure you want to delete this indicator?",
                fr: "Êtes-vous sûr de vouloir supprimer cet indicateur ?",
                pt: "Tem a certeza de que pretende eliminar este indicador?",
              })
            : t3({
                en: "Are you sure you want to delete these indicators?",
                fr: "Êtes-vous sûr de vouloir supprimer ces indicateurs ?",
                pt: "Tem a certeza de que pretende eliminar estes indicadores?",
              }),
        itemList: selected.map(
          (i) => `${i.indicator_common_id} ~ ${i.indicator_common_label}`,
        ),
      },
      () =>
        serverActions.deleteIndicators({ indicator_common_ids: indicatorIds }),
    );
    await deleteAction.click();
  }

  const columns: TableColumn<HmisIndicator>[] = [
    {
      key: "indicator_common_id",
      header: t3({
        en: "Indicator ID",
        fr: "ID de l'indicateur",
        pt: "ID do indicador",
      }),
      sortable: true,
      render: (indicator) => (
        <span class="ui-gap-sm flex items-center">
          <span class="font-mono">
            <WrapOnUnderscore text={indicator.indicator_common_id} />
          </span>
          <Show when={isSpecialIndicatorId(indicator.indicator_common_id)}>
            <SpecialBadge />
          </Show>
        </span>
      ),
    },
    {
      key: "indicator_common_label",
      header: t3(TC.label),
      sortable: true,
      render: (indicator) => (
        <WrapOnUnderscore text={indicator.indicator_common_label} />
      ),
    },
    {
      key: "type",
      header: t3({ en: "Type", fr: "Type", pt: "Tipo" }),
      sortable: true,
      sortValue: indicatorTypeLabel,
      filterable: true,
      filterValue: indicatorTypeLabel,
      render: (indicator) => (
        <IndicatorTypeBadge type={indicator.definition.type} />
      ),
    },
    {
      key: "defined_by",
      header: t3({ en: "Defined by", fr: "Défini par", pt: "Definido por" }),
      sortable: true,
      sortValue: definedByText,
      render: (indicator) => (
        <div class="text-xs">
          <div class="font-mono">
            <WrapOnUnderscore text={definedByText(indicator)} />
          </div>
          <Show when={dhis2LabelOf(indicator)}>
            {(label) => <div class="text-base-content-muted">{label()}</div>}
          </Show>
        </div>
      ),
    },
    {
      key: "include_in_analysis",
      header: t3({ en: "Include", fr: "Inclure", pt: "Incluir" }),
      sortable: true,
      sortValue: (indicator) => (isAnalysedFlag(indicator) ? 0 : 1),
      filterable: true,
      filterValue: (indicator) =>
        isAnalysedFlag(indicator)
          ? t3({ en: "Yes", fr: "Oui", pt: "Sim" })
          : t3({ en: "No", fr: "Non", pt: "Não" }),
      render: (indicator) => <TickCell when={isAnalysedFlag(indicator)} />,
    },
    {
      key: "status",
      header: t3({ en: "Status", fr: "Statut", pt: "Estado" }),
      sortable: true,
      sortValue: (indicator) => {
        const s = statusOf(indicator);
        return s?.problem ?? s?.population ?? "";
      },
      render: (indicator) => (
        <Show when={statusOf(indicator)}>
          {(s) => (
            <div class="text-xs">
              <Show when={s().problem}>
                {(problem) => (
                  <div class="text-danger font-700">{problem()}</div>
                )}
              </Show>
              <Show when={s().population}>
                {(population) => <div class="text-warning">{population()}</div>}
              </Show>
            </div>
          )}
        </Show>
      ),
    },
  ];

  const allColumns = createMemo<TableColumn<HmisIndicator>[]>(() => {
    if (!instanceState.currentUserIsGlobalAdmin) return columns;
    return [
      ...columns,
      {
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
                handleDeleteIndicators([indicator]);
              }}
              iconName="trash"
              intent="base-100"
            />
          </div>
        ),
      },
    ];
  });

  const bulkActions = createMemo<BulkAction<HmisIndicator>[]>(() =>
    instanceState.currentUserIsGlobalAdmin
      ? [
          {
            label: t3(DHIS2_DATA_IMPORT_TITLE),
            intent: "primary",
            outline: true,
            onClick: handleImportFromDhis2,
          },
          {
            label: t3({
              en: "Include in analysis",
              fr: "Inclure dans l'analyse",
              pt: "Incluir na análise",
            }),
            intent: "neutral",
            outline: true,
            onClick: (selected) => setIncludeInAnalysis.click(selected, true),
          },
          {
            label: t3({
              en: "Exclude from analysis",
              fr: "Exclure de l'analyse",
              pt: "Excluir da análise",
            }),
            intent: "neutral",
            outline: true,
            onClick: (selected) => setIncludeInAnalysis.click(selected, false),
          },
          {
            label: t3(TC.delete),
            intent: "danger",
            outline: true,
            onClick: handleDeleteIndicators,
          },
        ]
      : [],
  );

  return (
    <div class="flex h-full flex-col">
      <div class="ui-gap-sm flex items-center pb-4">
        <div class="ui-text-title flex-1">
          {t3({ en: "Indicators", fr: "Indicateurs", pt: "Indicadores" })} (
          {p.indicators.length})
        </div>
        <div class="w-72 xl:w-96">
          <Input
            value={search()}
            onChange={setSearch}
            searchIcon
            clearable
            fullWidth
            placeholder={t3({
              en: "Search indicators",
              fr: "Rechercher des indicateurs",
              pt: "Pesquisar indicadores",
            })}
          />
        </div>
        <Show when={instanceState.currentUserIsGlobalAdmin}>
          <Button
            onClick={handleSortIndicators}
            iconName="gripVertical"
            // intent="neutral"
            outline
          >
            {t3({ en: "Sort", fr: "Trier", pt: "Ordenar" })}
          </Button>
          <Button
            onClick={p.handleDhis2IndicatorSelect}
            iconName="import"
            intent="primary"
          >
            {t3({
              en: "Add from DHIS2",
              fr: "Ajouter depuis DHIS2",
              pt: "Adicionar do DHIS2",
            })}
          </Button>
          <Button
            onClick={handleCreateIndicator}
            iconName="plus"
            intent="primary"
          >
            {t3({ en: "Create new", fr: "Créer", pt: "Criar" })}
          </Button>
          <ActionMenuButton items={otherActions} outline />
        </Show>
      </div>
      <Show when={importNotice()}>
        {(notice) => (
          <Callout intent="success" pad="sm" class="mb-4 flex-none">
            <div class="ui-gap-sm flex items-center">
              <div class="flex-1">{importNoticeText(notice())}</div>
              <Button
                onClick={() => setImportNotice(undefined)}
                iconName="x"
                intent="success"
                size="sm"
              />
            </div>
          </Callout>
        )}
      </Show>
      <Show when={uncomputableCount() > 0}>
        <Callout intent="warning" pad="sm" class="mb-4 flex-none">
          {uncomputableCount() === 1
            ? t3({
                en: "1 calculated indicator cannot be computed. Results cannot be generated until it is edited or removed, or the indicators it uses have data.",
                fr: "1 indicateur calculé ne peut pas être évalué. Les résultats ne pourront pas être générés tant qu'il n'est pas modifié ou supprimé, ou que les indicateurs qu'il utilise n'ont pas de données.",
                pt: "1 indicador calculado não pode ser avaliado. Os resultados não podem ser gerados até que seja editado ou removido, ou até que os indicadores que utiliza tenham dados.",
              })
            : t3({
                en: `${uncomputableCount()} calculated indicators cannot be computed. Results cannot be generated until they are edited or removed, or the indicators they use have data.`,
                fr: `${uncomputableCount()} indicateurs calculés ne peuvent pas être évalués. Les résultats ne pourront pas être générés tant qu'ils ne sont pas modifiés ou supprimés, ou que les indicateurs qu'ils utilisent n'ont pas de données.`,
                pt: `${uncomputableCount()} indicadores calculados não podem ser avaliados. Os resultados não podem ser gerados até que sejam editados ou removidos, ou até que os indicadores que utilizam tenham dados.`,
              })}
        </Callout>
      </Show>
      <div class="h-0 w-full flex-1">
        <Table
          data={visibleIndicators()}
          columns={allColumns()}
          keyField="indicator_common_id"
          noRowsMessage={
            search() === ""
              ? t3({
                  en: "No indicators",
                  fr: "Aucun indicateur",
                  pt: "Nenhum indicador",
                })
              : t3({
                  en: "No indicators match",
                  fr: "Aucun indicateur ne correspond",
                  pt: "Nenhum indicador corresponde",
                })
          }
          bulkActions={bulkActions()}
          selectionLabel={t3({
            en: "indicator",
            fr: "indicateur",
            pt: "indicador",
          })}
          paddingY="compact"
        />
      </div>
    </div>
  );
}

// The flag as the analysed set reads it (`analysedIndicatorIds`): a special
// is analysed whatever its stored flag says, and the editor keeps it on.
function isAnalysedFlag(indicator: HmisIndicator): boolean {
  return (
    indicator.include_in_analysis ||
    isSpecialIndicatorId(indicator.indicator_common_id)
  );
}

// A read-only tick for the include-in-analysis flag, edited in the modal.
function TickCell(p: { when: boolean }) {
  return (
    <Show when={p.when}>
      <Icon iconName="check" />
    </Show>
  );
}

// The reference list (PLAN_A3 ruling 5): the special ids the analysis
// modules read by name, and every reserved word no indicator id may be.
function ReferenceListModal(p: AlertComponentProps<{}, undefined>) {
  return (
    <ModalContainer
      width="4xl"
      title={t3({
        en: "Special indicators and reserved words",
        fr: "Indicateurs spéciaux et mots réservés",
        pt: "Indicadores especiais e palavras reservadas",
      })}
      onCancel={() => p.close(undefined)}
      cancelLabel={t3({ en: "Done", fr: "Terminé", pt: "Concluído" })}
    >
      <div class="ui-spy text-sm">
        <div class="ui-spy-sm">
          <div class="font-700">
            {t3({
              en: "Special indicators",
              fr: "Indicateurs spéciaux",
              pt: "Indicadores especiais",
            })}
          </div>
          <div class="text-xs">
            {t3({
              en: "The analysis modules read these ids by name as counts, so one is always analysed whenever it exists. Create, rename or delete them in this list like any indicator. A special id can only be a DHIS2 element, Uploaded or a Sum.",
              fr: "Les modules d'analyse lisent ces identifiants par leur nom comme des dénombrements ; un tel indicateur est donc toujours analysé dès qu'il existe. Créez, renommez ou supprimez-les dans cette liste comme tout indicateur. Un identifiant spécial ne peut être qu'un élément DHIS2, téléversé ou une somme.",
              pt: "Os módulos de análise leem estes IDs pelo nome como contagens, pelo que um é sempre analisado sempre que existe. Crie, renomeie ou elimine-os nesta lista como qualquer indicador. Um ID especial só pode ser um elemento DHIS2, carregado ou uma soma.",
            })}
          </div>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(28rem,1fr))] gap-x-4 gap-y-1">
            <For each={SPECIAL_INDICATORS}>
              {(special) => (
                <div>
                  <span class="font-mono">{special.id}</span>
                  <span class="text-base-content-muted ml-2">
                    {t3(special.label)}
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
        <div class="ui-spy-sm">
          <div class="font-700">
            {t3({
              en: "Population terms",
              fr: "Termes de population",
              pt: "Termos de população",
            })}
          </div>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-x-4 gap-y-1">
            <For each={POPULATION_TYPE_IDS}>
              {(id) => (
                <div>
                  <span class="font-mono">{id}</span>
                  <span class="text-base-content-muted ml-2">
                    {t3(populationTypeLabel(id))}
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
        <div class="ui-spy-sm">
          <div class="font-700">
            {t3({
              en: "Reserved words",
              fr: "Mots réservés",
              pt: "Palavras reservadas",
            })}
          </div>
          <div class="text-xs">
            {t3({
              en: "No indicator id may be one of these, however it is produced: the special ids (except as a DHIS2 element, Uploaded or a Sum), the population terms and the formula function names.",
              fr: "Aucun identifiant d'indicateur ne peut être l'un de ceux-ci, quelle que soit la façon dont il est produit : les identifiants spéciaux (sauf comme élément DHIS2, indicateur téléversé ou somme), les termes de population et les noms de fonctions des formules.",
              pt: "Nenhum ID de indicador pode ser um destes, seja como for produzido: os IDs especiais (exceto como elemento DHIS2, carregado ou soma), os termos de população e os nomes das funções das fórmulas.",
            })}
          </div>
          <div class="font-mono text-xs">{RESERVED_WORDS.join(", ")}</div>
        </div>
      </div>
    </ModalContainer>
  );
}
