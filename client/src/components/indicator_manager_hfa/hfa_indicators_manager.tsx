import {
  t3,
  TC,
  type HfaDictionaryForValidation,
  type HfaIndicator,
  type HfaIndicatorCategory,
  type HfaIndicatorServiceCategory,
  type HfaIndicatorSubCategory,
  type HfaIndicatorCode,
} from "lib";
import {
  Button,
  FrameLeft,
  FrameTop,
  getQueryStateFromApiResponse,
  StateHolderWrapper,
  Table,
  TableColumn,
  TabsNavigation,
  getEditorWrapper,
  type ListItem,
  openComponent,
  saveAs,
  timActionDelete,
  type BulkAction,
  type StateHolder,
} from "panther";
import { Show, createEffect, createMemo, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { getHfaDictionaryFromCacheOrFetch } from "~/state/instance/t2_datasets";
import { getHfaIndicatorsFromCacheOrFetch } from "~/state/instance/t2_indicators";
import { EditHfaIndicator } from "../forms_editors/edit_hfa_indicator";
import { HfaIndicatorCodeEditor } from "./hfa_indicator_code_editor";
import { HfaIndicatorsXlsxUploadForm } from "./hfa_indicators_xlsx_upload_form";
import { HfaCategoriesManager } from "./hfa_categories_manager";
import { HfaServiceCategoriesManager } from "./hfa_service_categories_manager";
import { buildHfaWorkbookBlob } from "./_xlsx_workbook";
import { extractRIdentifiers, validateRCode } from "./hfa_r_code_validator";
import {
  HfaUnusedVariablesModal,
  type UnusedVariablesByTimePoint,
} from "./hfa_unused_variables_modal";

type Props = {
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
  const [categories, setCategories] = createSignal<
    StateHolder<HfaIndicatorCategory[]>
  >({
    status: "loading",
  });
  const [subCategories, setSubCategories] = createSignal<
    StateHolder<HfaIndicatorSubCategory[]>
  >({
    status: "loading",
  });
  const [serviceCategories, setServiceCategories] = createSignal<
    StateHolder<HfaIndicatorServiceCategory[]>
  >({
    status: "loading",
  });
  const [allCode, setAllCode] = createSignal<StateHolder<HfaIndicatorCode[]>>({
    status: "loading",
  });

  // Hoisted here (not inside HfaCategoriesManager) so the selection survives the
  // StateHolderWrapper remount that happens on every SSE refetch/mutation.
  const [selectedCategoryId, setSelectedCategoryId] = createSignal<
    string | null
  >(null);

  const [tab, setTab] = createSignal<
    "indicators" | "categories" | "service_categories"
  >("indicators");
  const tabItems: ListItem<"indicators" | "categories" | "service_categories">[] = [
    {
      id: "indicators",
      label: t3({ en: "Indicators", fr: "Indicateurs" }),
    },
    {
      id: "categories",
      label: t3({ en: "Categories", fr: "Catégories" }),
    },
    {
      id: "service_categories",
      label: t3({ en: "Service categories", fr: "Catégories de service" }),
    },
  ];

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

  createEffect(async () => {
    const version = instanceState.hfaIndicatorsVersion;
    if (!version) return;
    const res = await serverActions.getHfaIndicatorCategories({});
    setCategories(getQueryStateFromApiResponse(res));
  });

  createEffect(async () => {
    const version = instanceState.hfaIndicatorsVersion;
    if (!version) return;
    const res = await serverActions.getHfaIndicatorSubCategories({});
    setSubCategories(getQueryStateFromApiResponse(res));
  });

  createEffect(async () => {
    const version = instanceState.hfaIndicatorsVersion;
    if (!version) return;
    const res = await serverActions.getHfaIndicatorServiceCategories({});
    setServiceCategories(getQueryStateFromApiResponse(res));
  });

  createEffect(async () => {
    const version = instanceState.hfaIndicatorsVersion;
    if (!version) return;
    const res = await serverActions.getAllHfaIndicatorCode({});
    setAllCode(getQueryStateFromApiResponse(res));
  });

  type IndicatorCodeStats = {
    withCode: number;
    total: number;
    ready: number;
    error: number;
    consistent: boolean;
  };

  const statsByVarName = createMemo(() => {
    const map = new Map<string, IndicatorCodeStats>();
    const dictSt = dictionary();
    const codeSt = allCode();
    const indSt = indicators();
    if (
      dictSt.status !== "ready" ||
      codeSt.status !== "ready" ||
      indSt.status !== "ready"
    ) {
      return map;
    }
    const dict = dictSt.data;
    const total = dict.timePoints.length;

    const codeByVarName = new Map<string, HfaIndicatorCode[]>();
    for (const c of codeSt.data) {
      const arr = codeByVarName.get(c.varName) ?? [];
      arr.push(c);
      codeByVarName.set(c.varName, arr);
    }

    const allVarNames = new Set(indSt.data.map((i) => i.varName));

    for (const ind of indSt.data) {
      const indCode = codeByVarName.get(ind.varName) ?? [];
      const otherVarNames = new Set(allVarNames);
      otherVarNames.delete(ind.varName);

      const withCodeEntries = indCode.filter((c) => c.rCode.trim());
      let ready = 0;
      let error = 0;
      for (const c of withCodeEntries) {
        const tp = dict.timePoints.find((t) => t.timePoint === c.timePoint);
        const availableVars = tp
          ? new Set(tp.vars.map((v) => v.varName))
          : new Set<string>();
        let hasErr = false;
        const rCodeResult = validateRCode(
          c.rCode,
          availableVars,
          otherVarNames,
        );
        if (
          rCodeResult.syntaxErrors.length > 0 ||
          rCodeResult.warnings.length > 0
        ) {
          hasErr = true;
        }
        if (c.rFilterCode?.trim()) {
          const rFilterResult = validateRCode(
            c.rFilterCode,
            availableVars,
            otherVarNames,
          );
          if (
            rFilterResult.syntaxErrors.length > 0 ||
            rFilterResult.warnings.length > 0
          ) {
            hasErr = true;
          }
        }
        if (hasErr) error++;
        else ready++;
      }

      const nonEmpty = indCode.filter(
        (c) => c.rCode.trim() || c.rFilterCode?.trim(),
      );
      let consistent = true;
      if (nonEmpty.length > 1) {
        const first = nonEmpty[0];
        consistent = nonEmpty.every(
          (c) =>
            c.rCode.trim() === first.rCode.trim() &&
            (c.rFilterCode?.trim() ?? "") === (first.rFilterCode?.trim() ?? ""),
        );
      }

      map.set(ind.varName, {
        withCode: withCodeEntries.length,
        total,
        ready,
        error,
        consistent,
      });
    }
    return map;
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
        const tp = dict.timePoints.find((t) => t.timePoint === c.timePoint);
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
    const catSt = categories();
    const subCatSt = subCategories();
    const svcCatSt = serviceCategories();
    if (
      catSt.status !== "ready" ||
      subCatSt.status !== "ready" ||
      svcCatSt.status !== "ready"
    )
      return;
    const sortOrder = st.status === "ready" ? st.data.length : 0;
    await openComponent({
      element: EditHfaIndicator,
      props: {
        sortOrder,
        categories: catSt.data,
        subCategories: subCatSt.data,
        serviceCategories: svcCatSt.data,
      },
    });
  }

  async function handleOpenCodeEditor(
    indicator: HfaIndicator,
    allIndicators: HfaIndicator[],
  ) {
    const dictState = dictionary();
    const catSt = categories();
    const subCatSt = subCategories();
    const svcCatSt = serviceCategories();
    if (
      dictState.status !== "ready" ||
      catSt.status !== "ready" ||
      subCatSt.status !== "ready" ||
      svcCatSt.status !== "ready"
    )
      return;
    const dict = dictState.data;
    await openEditor({
      element: HfaIndicatorCodeEditor,
      props: {
        indicator,
        dictionary: dict,
        allIndicatorVarNames: allIndicators.map((i) => i.varName),
        categories: catSt.data,
        subCategories: subCatSt.data,
        serviceCategories: svcCatSt.data,
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

  function sortedTimePointLabels(): string[] | undefined {
    const dictSt = dictionary();
    if (dictSt.status !== "ready") return undefined;
    return [...dictSt.data.timePoints]
      .sort((a, b) => a.timePoint.localeCompare(b.timePoint))
      .map((tp) => tp.timePoint);
  }

  function handleDownloadXlsx() {
    const indSt = indicators();
    const catSt = categories();
    const subCatSt = subCategories();
    const svcCatSt = serviceCategories();
    const codeSt = allCode();
    const timePoints = sortedTimePointLabels();
    if (
      indSt.status !== "ready" ||
      catSt.status !== "ready" ||
      subCatSt.status !== "ready" ||
      svcCatSt.status !== "ready" ||
      codeSt.status !== "ready" ||
      timePoints === undefined
    ) {
      return;
    }
    const blob = buildHfaWorkbookBlob({
      categories: catSt.data,
      subCategories: subCatSt.data,
      serviceCategories: svcCatSt.data,
      indicators: indSt.data,
      code: codeSt.data,
      timePoints,
    });
    saveAs(blob, "hfa_indicators.xlsx");
  }

  async function handleXlsxUpload() {
    const timePoints = sortedTimePointLabels();
    if (timePoints === undefined) return;
    await openEditor({
      element: HfaIndicatorsXlsxUploadForm,
      props: { timePoints },
    });
  }

  async function handleCheckUnusedVariables() {
    const dictSt = dictionary();
    const codeSt = allCode();
    if (dictSt.status !== "ready" || codeSt.status !== "ready") return;
    const dict = dictSt.data;

    const availableByTimePoint = new Map<string, Set<string>>();
    const usedByTimePoint = new Map<string, Set<string>>();
    for (const tp of dict.timePoints) {
      availableByTimePoint.set(
        tp.timePoint,
        new Set(tp.vars.map((v) => v.varName)),
      );
      usedByTimePoint.set(tp.timePoint, new Set<string>());
    }

    for (const c of codeSt.data) {
      const available = availableByTimePoint.get(c.timePoint);
      const used = usedByTimePoint.get(c.timePoint);
      if (!available || !used) continue;
      const identifiers = [
        ...extractRIdentifiers(c.rCode),
        ...(c.rFilterCode ? extractRIdentifiers(c.rFilterCode) : []),
      ];
      for (const id of identifiers) {
        if (available.has(id)) used.add(id);
      }
    }

    const timePoints: UnusedVariablesByTimePoint[] = [...dict.timePoints]
      .sort((a, b) => a.timePoint.localeCompare(b.timePoint))
      .map((tp) => {
        const used = usedByTimePoint.get(tp.timePoint) ?? new Set<string>();
        return {
          timePoint: tp.timePoint,
          unused: tp.vars
            .filter((v) => !used.has(v.varName))
            .map((v) => ({ varName: v.varName, varLabel: v.varLabel })),
        };
      });

    await openComponent({
      element: HfaUnusedVariablesModal,
      props: { timePoints },
    });
  }

  const columns: TableColumn<HfaIndicator>[] = [
    {
      key: "categoryId",
      header: t3({ en: "Category", fr: "Catégorie" }),
      sortable: true,
      render: (ind) => {
        if (!ind.categoryId) return "—";
        const catSt = categories();
        if (catSt.status !== "ready") return ind.categoryId;
        const cat = catSt.data.find((c) => c.id === ind.categoryId);
        return cat?.label ?? ind.categoryId;
      },
    },
    {
      key: "subCategoryId",
      header: t3({ en: "Sub-category", fr: "Sous-catégorie" }),
      sortable: true,
      render: (ind) => {
        if (!ind.subCategoryId) return "—";
        const subCatSt = subCategories();
        if (subCatSt.status !== "ready") return ind.subCategoryId;
        const subCat = subCatSt.data.find((sc) => sc.id === ind.subCategoryId);
        return subCat?.label ?? ind.subCategoryId;
      },
    },
    {
      key: "serviceCategoryId",
      header: t3({ en: "Service category", fr: "Catégorie de service" }),
      sortable: true,
      render: (ind) => {
        if (!ind.serviceCategoryId) return "—";
        const svcCatSt = serviceCategories();
        if (svcCatSt.status !== "ready") return ind.serviceCategoryId;
        const svcCat = svcCatSt.data.find(
          (sc) => sc.id === ind.serviceCategoryId,
        );
        return svcCat?.label ?? ind.serviceCategoryId;
      },
    },
    {
      key: "varName",
      header: t3({ en: "Variable Name", fr: "Nom de variable" }),
      sortable: true,
      render: (ind) => <span class="font-mono">{ind.varName}</span>,
    },
    {
      key: "shortLabel",
      header: t3({ en: "Short label", fr: "Libellé court" }),
      sortable: true,
      render: (ind) =>
        ind.shortLabel ? ind.shortLabel : <span class="text-neutral">—</span>,
    },
    {
      key: "definition",
      header: t3({ en: "Long label", fr: "Libellé long" }),
      sortable: true,
    },
    {
      key: "type",
      header: t3({ en: "Type", fr: "Type" }),
      sortable: true,
      render: (ind) => (
        <span>
          {ind.type === "binary" ? "Boolean" : "Numeric"} (
          {ind.aggregation === "sum" ? "Sum" : "Avg"})
        </span>
      ),
    },
    {
      key: "timePoints",
      header: t3({ en: "Time points", fr: "Points temporels" }),
      sortable: true,
      sortValue: (ind) => statsByVarName().get(ind.varName)?.withCode ?? -1,
      render: (ind) => {
        const stats = statsByVarName().get(ind.varName);
        if (!stats) return "…";
        return (
          <span class={stats.withCode === 0 ? "text-neutral" : ""}>
            {t3({
              en: `${stats.withCode} of ${stats.total}`,
              fr: `${stats.withCode} sur ${stats.total}`,
            })}
          </span>
        );
      },
    },
    {
      key: "status",
      header: t3({ en: "Status", fr: "Statut" }),
      sortable: true,
      sortValue: (ind) => statsByVarName().get(ind.varName)?.error ?? -1,
      render: (ind) => {
        const stats = statsByVarName().get(ind.varName);
        if (!stats) return "…";
        if (stats.withCode === 0) {
          return <span class="text-neutral">—</span>;
        }
        return (
          <span>
            <Show when={stats.ready > 0}>
              <span class="text-success">
                {t3({ en: `${stats.ready} ready`, fr: `${stats.ready} prêt` })}
              </span>
            </Show>
            <Show when={stats.error > 0}>
              <Show when={stats.ready > 0}>
                <span>, </span>
              </Show>
              <span class="text-danger font-700">
                {t3({
                  en: `${stats.error} error`,
                  fr: `${stats.error} erreur`,
                })}
              </span>
            </Show>
          </span>
        );
      },
    },
    {
      key: "codeConsistent",
      header: t3({ en: "Consistent", fr: "Cohérent" }),
      sortable: true,
      sortValue: (ind) => {
        const stats = statsByVarName().get(ind.varName);
        if (!stats || stats.withCode === 0) return -1;
        return stats.consistent ? 1 : 0;
      },
      render: (ind) => {
        const stats = statsByVarName().get(ind.varName);
        if (!stats || stats.withCode === 0) {
          return <span class="text-neutral">—</span>;
        }
        return (
          <span>
            {stats.consistent
              ? t3({ en: "Yes", fr: "Oui" })
              : t3({ en: "No", fr: "Non" })}
          </span>
        );
      },
    },
  ];

  if (instanceState.currentUserIsGlobalAdmin) {
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

  const bulkActions: BulkAction<HfaIndicator>[] =
    instanceState.currentUserIsGlobalAdmin
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
          </div>
        }
      >
        <FrameTop
          panelChildren={
            <TabsNavigation items={tabItems} value={tab()} onChange={setTab} />
          }
        >
          <div class="ui-pad h-full w-full overflow-auto">
            <Show when={tab() === "indicators"}>
              <StateHolderWrapper state={indicators()} noPad>
                {(keyedIndicators) => (
                  <div class="flex h-full flex-col">
                    <div class="ui-gap-sm flex flex-none items-center pb-4">
                      <div class="font-700 flex-1 text-xl">
                        {t3({ en: "Indicators", fr: "Indicateurs" })} (
                        {keyedIndicators.length})
                      </div>
                      <Show when={instanceState.currentUserIsGlobalAdmin}>
                        <Button
                          iconName="refresh"
                          onClick={handleRevalidateAll}
                          loading={revalidating()}
                          outline
                        >
                          {t3({ en: "Revalidate all", fr: "Revalider tout" })}
                        </Button>
                        <Button
                          iconName="search"
                          onClick={handleCheckUnusedVariables}
                          outline
                        >
                          {t3({
                            en: "Check unused variables",
                            fr: "Vérifier les variables inutilisées",
                          })}
                        </Button>
                        <Button
                          iconName="download"
                          onClick={handleDownloadXlsx}
                          outline
                        >
                          {t3({
                            en: "Download Excel",
                            fr: "Télécharger Excel",
                          })}
                        </Button>
                        <Button
                          iconName="upload"
                          onClick={handleXlsxUpload}
                          outline
                        >
                          {t3({ en: "Import Excel", fr: "Importer Excel" })}
                        </Button>
                        <Button
                          iconName="plus"
                          intent="primary"
                          onClick={handleCreate}
                        >
                          {t3({ en: "Add", fr: "Ajouter" })}
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
                        selectionLabel={t3({
                          en: "indicator",
                          fr: "indicateur",
                        })}
                        fitTableToAvailableHeight
                      />
                    </div>
                  </div>
                )}
              </StateHolderWrapper>
            </Show>
            <Show when={tab() === "categories"}>
              <StateHolderWrapper state={categories()} noPad>
                {(keyedCategories) => (
                  <StateHolderWrapper state={subCategories()} noPad>
                    {(keyedSubCategories) => (
                      <HfaCategoriesManager
                        categories={keyedCategories}
                        subCategories={keyedSubCategories}
                        selectedCategoryId={selectedCategoryId()}
                        onSelectCategory={setSelectedCategoryId}
                      />
                    )}
                  </StateHolderWrapper>
                )}
              </StateHolderWrapper>
            </Show>
            <Show when={tab() === "service_categories"}>
              <StateHolderWrapper state={serviceCategories()} noPad>
                {(keyedServiceCategories) => (
                  <HfaServiceCategoriesManager
                    serviceCategories={keyedServiceCategories}
                  />
                )}
              </StateHolderWrapper>
            </Show>
          </div>
        </FrameTop>
      </FrameTop>
    </EditorWrapper>
  );
}
