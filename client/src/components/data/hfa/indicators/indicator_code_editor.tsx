import {
  type APIResponseNoData,
  composeHfaIndicatorLabel,
  HFA_CODE_LIST_EXAMPLE,
  HFA_CODE_SYMBOLS,
  HFA_CODE_WORDS,
  type HfaDictionaryForValidation,
  type HfaFieldIssue,
  type HfaIndicator,
  type HfaIndicatorCategory,
  type HfaIndicatorCode,
  type HfaIndicatorServiceCategory,
  hfaIndicatorsStatus,
  type HfaIndicatorSubCategory,
  type HfaIndicatorVariantCode,
  type HfaIndicatorVariantGroup,
  type HfaIndicatorVariantItem,
  t3,
  TC,
  validateHfaIndicatorCode,
} from "lib";
import {
  Button,
  createButtonAction,
  createQuery,
  EditorComponentProps,
  foldString,
  FrameTop,
  HeadingBar,
  Input,
  matchesSearch,
  MultiSelect,
  openConfirm,
  RadioGroup,
  searchTokens,
  Select,
  StateHolderWrapper,
  TextArea,
} from "panther";
import { createMemo, createSignal, For, Show } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import {
  copilotViewController,
  type HfaIndicatorEditorDraft,
  type HfaIndicatorEditorPatch,
  holdCopilotView,
} from "~/components/instance/copilot/mod.ts";

type TempCodeEntry = {
  timePoint: string;
  rCode: string;
  rFilterCode: string;
};

type TempState = {
  categoryId: string | null;
  subCategoryId: string | null;
  serviceCategoryIds: string[];
  shortLabel: string;
  definition: string;
  type: "binary" | "numeric";
  aggregation: "sum" | "avg";
  variantGroupId: string | null;
  code: TempCodeEntry[];
  // Per-item numerator code, keyed "timePoint / itemId". The server only
  // stores rows for the indicator's current group, and a confirmed group
  // switch clears the old group's entries here too: otherwise switching back
  // would display deleted code as if it were still persisted.
  variantCode: Record<string, string>;
};

function variantKey(timePoint: string, itemId: string): string {
  return `${timePoint} / ${itemId}`;
}

export function HfaIndicatorCodeEditor(
  p: EditorComponentProps<
    {
      indicator: HfaIndicator;
      dictionary: HfaDictionaryForValidation;
      indicators: HfaIndicator[];
      allCode: HfaIndicatorCode[];
      allVariantCode: HfaIndicatorVariantCode[];
      categories: HfaIndicatorCategory[];
      subCategories: HfaIndicatorSubCategory[];
      serviceCategories: HfaIndicatorServiceCategory[];
      variantGroups: HfaIndicatorVariantGroup[];
      variantItems: HfaIndicatorVariantItem[];
      deleteIndicator: (onDeleted: () => void) => Promise<void>;
    },
    undefined
  >,
) {
  // The editor holds the manager's view; EditorInner sets
  // `hfa_indicator_editor` once the draft store exists (S13).
  holdCopilotView();
  const codeQuery = createQuery(
    () =>
      serverActions.getHfaIndicatorCode({
        indicatorId: p.indicator.indicatorId,
      }),
    t3({
      en: "Loading code...",
      fr: "Chargement du code...",
      pt: "A carregar o código...",
    }),
  );
  const variantCodeQuery = createQuery(
    () =>
      serverActions.getHfaIndicatorVariantCode({
        indicatorId: p.indicator.indicatorId,
      }),
    t3({
      en: "Loading code...",
      fr: "Chargement du code...",
      pt: "A carregar o código...",
    }),
  );

  const [needsSaving, setNeedsSaving] = createSignal(false);
  let doSave: (() => Promise<APIResponseNoData>) | undefined;

  const runSave = () =>
    doSave?.() ?? Promise.resolve({ success: true } as APIResponseNoData);

  const save = createButtonAction(runSave, () => {
    setNeedsSaving(false);
  });

  const saveAndClose = createButtonAction(runSave, () => {
    p.close(undefined);
  });

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          tonal
          leftChildren={
            <div class="ui-gap flex items-center">
              <Show
                when={needsSaving()}
                fallback={
                  <Button
                    iconName="chevronLeft"
                    onClick={() => p.close(undefined)}
                  />
                }
              >
                <Button
                  onClick={saveAndClose.click}
                  state={saveAndClose.state()}
                  intent="success"
                  iconName="save"
                >
                  {t3({
                    en: "Save and close",
                    fr: "Sauvegarder et quitter",
                    pt: "Guardar e fechar",
                  })}
                </Button>
                <Button
                  intent="success"
                  iconName="save"
                  onClick={save.click}
                  state={save.state()}
                >
                  {t3({ en: "Save", fr: "Sauvegarder", pt: "Guardar" })}
                </Button>
                <Button intent="neutral" onClick={() => p.close(undefined)}>
                  {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
                </Button>
              </Show>
            </div>
          }
          heading={composeHfaIndicatorLabel(p.indicator, "compact")}
          subheading={p.indicator.shortLabel.trim()
            ? p.indicator.definition
            : undefined}
        >
          <Button
            intent="danger"
            outline
            onBackground="base-300"
            iconName="trash"
            onClick={() => p.deleteIndicator(() => p.close(undefined))}
          >
            {t3(TC.delete)}
          </Button>
        </HeadingBar>
      }
    >
      <StateHolderWrapper state={codeQuery.state()} loadingAndErrorPad="md">
        {(codeSnippets) => (
          <StateHolderWrapper
            state={variantCodeQuery.state()}
            loadingAndErrorPad="md"
          >
            {(variantCodeSnippets) => (
              <EditorInner
                indicator={p.indicator}
                dictionary={p.dictionary}
                indicators={p.indicators}
                allCode={p.allCode}
                allVariantCode={p.allVariantCode}
                categories={p.categories}
                subCategories={p.subCategories}
                serviceCategories={p.serviceCategories}
                variantGroups={p.variantGroups}
                variantItems={p.variantItems}
                initialCodeSnippets={codeSnippets}
                initialVariantCodeSnippets={variantCodeSnippets}
                setNeedsSaving={setNeedsSaving}
                registerSave={(fn) => {
                  doSave = fn;
                }}
              />
            )}
          </StateHolderWrapper>
        )}
      </StateHolderWrapper>
    </FrameTop>
  );
}

function EditorInner(p: {
  indicator: HfaIndicator;
  dictionary: HfaDictionaryForValidation;
  indicators: HfaIndicator[];
  allCode: HfaIndicatorCode[];
  allVariantCode: HfaIndicatorVariantCode[];
  categories: HfaIndicatorCategory[];
  subCategories: HfaIndicatorSubCategory[];
  serviceCategories: HfaIndicatorServiceCategory[];
  variantGroups: HfaIndicatorVariantGroup[];
  variantItems: HfaIndicatorVariantItem[];
  initialCodeSnippets: HfaIndicatorCode[];
  initialVariantCodeSnippets: HfaIndicatorVariantCode[];
  setNeedsSaving: (v: boolean) => void;
  registerSave: (fn: () => Promise<APIResponseNoData>) => void;
}) {
  const initialCode: TempCodeEntry[] = p.dictionary.timePoints.map((tp) => {
    const existing = p.initialCodeSnippets.find(
      (s) => s.timePoint === tp.timePoint,
    );
    return {
      timePoint: tp.timePoint,
      rCode: existing?.rCode ?? "",
      rFilterCode: existing?.rFilterCode ?? "",
    };
  });

  const initialVariantCode: Record<string, string> = {};
  for (const c of p.initialVariantCodeSnippets) {
    initialVariantCode[variantKey(c.timePoint, c.itemId)] = c.rCode;
  }

  const [state, setState] = createStore<TempState>({
    categoryId: p.indicator.categoryId,
    subCategoryId: p.indicator.subCategoryId,
    serviceCategoryIds: p.indicator.serviceCategoryIds,
    shortLabel: p.indicator.shortLabel,
    definition: p.indicator.definition,
    type: p.indicator.type,
    aggregation: p.indicator.aggregation,
    variantGroupId: p.indicator.variantGroupId,
    code: initialCode,
    variantCode: initialVariantCode,
  });

  const filteredSubCategories = () => {
    if (!state.categoryId) return [];
    return p.subCategories.filter((sc) => sc.categoryId === state.categoryId);
  };

  const currentGroupItems = () => {
    if (!state.variantGroupId) return [];
    return p.variantItems
      .filter((it) => it.groupId === state.variantGroupId)
      .toSorted((a, b) => a.sortOrder - b.sortOrder);
  };

  const [selectedTimePoint, setSelectedTimePoint] = createSignal(
    p.dictionary.timePoints[0]?.timePoint ?? "",
  );

  const [variableSearch, setVariableSearch] = createSignal("");

  const otherIndicators = p.indicators.filter(
    (i) => i.indicatorId !== p.indicator.indicatorId,
  );
  const otherIndicatorIds = new Set(otherIndicators.map((i) => i.indicatorId));

  const currentTpIndex = () =>
    state.code.findIndex((c) => c.timePoint === selectedTimePoint());

  const currentTpDict = () =>
    p.dictionary.timePoints.find((tp) => tp.timePoint === selectedTimePoint());

  const valuesForVariable = (variableId: string) => {
    const dict = currentTpDict();
    if (!dict) return [];
    return dict.values.filter((v) => v.variableId === variableId);
  };

  const referencedLabel = (id: string): string | undefined => {
    const variable = currentTpDict()?.variables.find(
      (v) => v.variableId === id,
    );
    if (variable) return variable.variableLabel;
    const indicator = otherIndicators.find((i) => i.indicatorId === id);
    return indicator
      ? composeHfaIndicatorLabel(indicator, "compact")
      : undefined;
  };

  // Variant entries to save: current group's items only, non-empty code.
  const variantCodeToSave = (): {
    timePoint: string;
    itemId: string;
    rCode: string;
  }[] => {
    const entries: { timePoint: string; itemId: string; rCode: string }[] = [];
    for (const tp of p.dictionary.timePoints) {
      for (const item of currentGroupItems()) {
        const rCode =
          (state.variantCode[variantKey(tp.timePoint, item.id)] ?? "").trim();
        if (rCode) {
          entries.push({ timePoint: tp.timePoint, itemId: item.id, rCode });
        }
      }
    }
    return entries;
  };

  // The draft's status: the core over the manager's code with this
  // indicator's saved code replaced by the draft, so a cycle through another
  // indicator shows here before the save.
  const draftStatus = createMemo(() => {
    const id = p.indicator.indicatorId;
    const draft: HfaIndicator = {
      ...p.indicator,
      type: state.type,
      variantGroupId: state.variantGroupId,
    };
    return hfaIndicatorsStatus({
      indicators: p.indicators.map((i) => i.indicatorId === id ? draft : i),
      code: [
        ...p.allCode.filter((c) => c.indicatorId !== id),
        ...state.code.map((c) => ({ ...c, indicatorId: id })),
      ],
      variantCode: [
        ...p.allVariantCode.filter((c) => c.indicatorId !== id),
        ...variantCodeToSave().map((c) => ({ ...c, indicatorId: id })),
      ],
      variantItems: p.variantItems,
      dictionary: p.dictionary,
      only: new Set([id]),
    }).get(id)!;
  });

  const describeReferenced = (id: string) => ({
    label: referencedLabel(id),
    values: valuesForVariable(id)
      .map((vv) => `${vv.value}=${vv.valueLabel}`)
      .join(", "),
  });

  const roundsConsistency = () => {
    if (!draftStatus().consistent) return "different" as const;
    const nonEmpty = state.code.filter(
      (c) => c.rCode.trim() || c.rFilterCode.trim(),
    );
    return nonEmpty.length <= 1 ? ("single" as const) : ("same" as const);
  };

  const fieldIssues = (
    timePoint: string,
    field: HfaFieldIssue["field"],
    itemId?: string,
  ): HfaFieldIssue[] =>
    draftStatus().rounds.find((r) => r.timePoint === timePoint)?.issues
      .filter((i) => i.field === field && i.itemId === itemId) ?? [];

  function applyToOtherRounds() {
    const idx = currentTpIndex();
    if (idx < 0) return;
    const src = state.code[idx];
    for (let i = 0; i < state.code.length; i++) {
      if (i === idx) continue;
      setState("code", i, "rCode", src.rCode);
      setState("code", i, "rFilterCode", src.rFilterCode);
    }
    const srcTp = selectedTimePoint();
    for (const item of currentGroupItems()) {
      const srcCode = state.variantCode[variantKey(srcTp, item.id)] ?? "";
      for (const tp of p.dictionary.timePoints) {
        if (tp.timePoint === srcTp) continue;
        setState("variantCode", variantKey(tp.timePoint, item.id), srcCode);
      }
    }
    markDirty();
  }

  const availableVariableIds = () => {
    const dict = currentTpDict();
    if (!dict) return new Set<string>();
    return new Set(dict.variables.map((v) => v.variableId));
  };

  // The referenced ids the editor lists under a field, with their labels.
  const referencedIds = (code: string): string[] =>
    validateHfaIndicatorCode(code, availableVariableIds(), otherIndicatorIds)
      .referencedIds;

  // Save refuses only what a run could never use: a filter or variant code in
  // a round without indicator code. Every other issue is shown and saved.
  p.registerSave(async () => {
    const refused = draftStatus().rounds.flatMap((r) =>
      r.issues
        .filter((i) =>
          i.kind === "filter_without_code" || i.kind === "variant_without_code"
        )
        .map((i) => `${r.timePoint}: ${t3(i.text)}`)
    );
    if (refused.length > 0) {
      return { success: false, err: refused.join("\n") };
    }

    const variantCode = variantCodeToSave();

    return await serverActions.saveHfaIndicatorFull({
      indicator: {
        indicatorId: p.indicator.indicatorId,
        categoryId: state.categoryId,
        subCategoryId: state.subCategoryId,
        serviceCategoryIds: state.serviceCategoryIds,
        shortLabel: state.shortLabel.trim(),
        definition: state.definition.trim(),
        type: state.type,
        aggregation: state.aggregation,
        sortOrder: p.indicator.sortOrder,
        variantGroupId: state.variantGroupId,
      },
      code: unwrap(state.code).map((c) => ({
        timePoint: c.timePoint,
        rCode: c.rCode.trim(),
        rFilterCode: c.rFilterCode.trim() || undefined,
      })),
      variantCode,
    });
  });

  function markDirty() {
    p.setNeedsSaving(true);
  }

  function insertSymbol(symbol: string) {
    setState(
      "code",
      currentTpIndex(),
      "rCode",
      (prev) =>
        prev + (prev.length === 0 || /\s$/.test(prev) ? "" : " ") + symbol +
        " ",
    );
    markDirty();
  }

  const variableSearchTokens = createMemo(() => searchTokens(variableSearch()));
  // The searched texts come from several lists (variables per round,
  // indicators), so each is folded once on first use, not per keystroke.
  const foldedTexts = new Map<string, string>();
  const folded = (text: string) => {
    const known = foldedTexts.get(text);
    if (known !== undefined) {
      return known;
    }
    const fresh = foldString(text);
    foldedTexts.set(text, fresh);
    return fresh;
  };
  const searchMatches = (text: string) =>
    matchesSearch(folded(text), variableSearchTokens());

  // The issues the editor shows for one round, as English lines for the
  // chat.
  const roundIssues = (c: TempCodeEntry): string[] =>
    draftStatus().rounds.find((r) => r.timePoint === c.timePoint)?.issues
      .map((i) =>
        `${
          i.itemId === undefined ? i.field : `variant ${i.itemId}`
        }: ${i.text.en}`
      ) ?? [];

  const getDraft = (): HfaIndicatorEditorDraft => ({
    shortLabel: state.shortLabel,
    definition: state.definition,
    type: state.type,
    aggregation: state.aggregation,
    categoryId: state.categoryId,
    subCategoryId: state.subCategoryId,
    serviceCategoryIds: [...state.serviceCategoryIds],
    code: state.code.map((c) => ({
      timePoint: c.timePoint,
      rCode: c.rCode,
      rFilterCode: c.rFilterCode,
      issues: roundIssues(c),
    })),
    codeConsistent: roundsConsistency() !== "different",
  });

  // The chat's write, with the controls' own semantics: a category change
  // clears the sub-category (the category select does the same), a round
  // keeps the field the patch omits, and the draft is marked unsaved.
  const applyDraft = (patch: HfaIndicatorEditorPatch) => {
    if (
      patch.categoryId !== undefined && patch.categoryId !== state.categoryId
    ) {
      setState("categoryId", patch.categoryId);
      setState("subCategoryId", null);
    }
    if (patch.subCategoryId !== undefined) {
      setState("subCategoryId", patch.subCategoryId);
    }
    if (patch.serviceCategoryIds !== undefined) {
      setState("serviceCategoryIds", patch.serviceCategoryIds);
    }
    if (patch.shortLabel !== undefined) {
      setState("shortLabel", patch.shortLabel);
    }
    if (patch.definition !== undefined) {
      setState("definition", patch.definition);
    }
    if (patch.type !== undefined) setState("type", patch.type);
    if (patch.aggregation !== undefined) {
      setState("aggregation", patch.aggregation);
    }
    for (const round of patch.code ?? []) {
      const idx = state.code.findIndex((c) => c.timePoint === round.timePoint);
      if (idx < 0) continue;
      if (round.rCode !== undefined) {
        setState("code", idx, "rCode", round.rCode);
      }
      if (round.rFilterCode !== undefined) {
        setState("code", idx, "rFilterCode", round.rFilterCode);
      }
    }
    markDirty();
  };

  copilotViewController.setView(
    "hfa_indicator_editor",
    { indicatorId: p.indicator.indicatorId },
    {
      getLabel: () => composeHfaIndicatorLabel(p.indicator, "compact"),
      getSelectedTimePoint: selectedTimePoint,
      getDraft,
      getTaxonomy: () => ({
        categories: p.categories,
        subCategories: p.subCategories,
        serviceCategories: p.serviceCategories,
      }),
      applyDraft,
    },
  );

  return (
    <div class="flex h-full flex-col">
      <div class="flex-none border-b">
        <div class="ui-pad ui-spy-sm">
          <div class="flex items-end gap-4">
            <Select
              label={t3({ en: "Category", fr: "Catégorie", pt: "Categoria" })}
              value={state.categoryId ?? ""}
              onChange={(v) => {
                setState("categoryId", v || null);
                setState("subCategoryId", null);
                markDirty();
              }}
              options={[
                {
                  value: "",
                  label: t3({
                    en: "— None —",
                    fr: "— Aucune —",
                    pt: "— Nenhuma —",
                  }),
                },
                ...p.categories.map((c) => ({ value: c.id, label: c.label })),
              ]}
            />
            <Select
              label={t3({
                en: "Sub-category",
                fr: "Sous-catégorie",
                pt: "Subcategoria",
              })}
              value={state.subCategoryId ?? ""}
              onChange={(v) => {
                setState("subCategoryId", v || null);
                markDirty();
              }}
              options={state.categoryId
                ? [
                  {
                    value: "",
                    label: t3({
                      en: "— None —",
                      fr: "— Aucune —",
                      pt: "— Nenhuma —",
                    }),
                  },
                  ...filteredSubCategories().map((sc) => ({
                    value: sc.id,
                    label: sc.label,
                  })),
                ]
                : [{
                  value: "",
                  label: t3({
                    en: "— Select category first —",
                    fr: "— Sélectionnez d'abord une catégorie —",
                    pt: "— Selecione primeiro uma categoria —",
                  }),
                }]}
            />
            <div class="min-w-[200px]">
              <MultiSelect
                label={t3({
                  en: "Service categories",
                  fr: "Catégories de service",
                  pt: "Categorias de serviço",
                })}
                values={state.serviceCategoryIds}
                onChange={(v) => {
                  setState("serviceCategoryIds", v);
                  markDirty();
                }}
                options={p.serviceCategories.map((sc) => ({
                  value: sc.id,
                  label: sc.label,
                }))}
              />
            </div>
            <Select
              label={t3({
                en: "Variant group",
                fr: "Groupe de variantes",
                pt: "Grupo de variantes",
              })}
              value={state.variantGroupId ?? ""}
              onChange={async (v) => {
                const newGroupId = v || null;
                if (newGroupId === state.variantGroupId) return;
                const oldItems = currentGroupItems();
                const hasOldCode = oldItems.some((item) =>
                  p.dictionary.timePoints.some(
                    (tp) =>
                      (state.variantCode[variantKey(tp.timePoint, item.id)] ??
                        "")
                        .trim() !== "",
                  )
                );
                if (hasOldCode) {
                  const confirmed = await openConfirm({
                    title: t3({
                      en: "Switch variant group?",
                      fr: "Changer de groupe de variantes ?",
                      pt: "Mudar de grupo de variantes?",
                    }),
                    text: t3({
                      en:
                        "This indicator has per-item code for the current group. Switching deletes that code when you save.",
                      fr:
                        "Cet indicateur a du code par élément pour le groupe actuel. Changer de groupe supprime ce code lors de la sauvegarde.",
                      pt:
                        "Este indicador tem código por item para o grupo atual. Mudar de grupo elimina esse código ao guardar.",
                    }),
                    intent: "danger",
                    confirmButtonLabel: t3({
                      en: "Switch group",
                      fr: "Changer de groupe",
                      pt: "Mudar de grupo",
                    }),
                  });
                  if (!confirmed) {
                    // The native select already displays the picked option and
                    // state never changed, so the value binding won't re-fire
                    // on its own: the control would show the wrong group and
                    // re-picking the displayed option would be a dead change
                    // event. A synchronous set-away-and-back re-runs the
                    // binding and snaps the DOM back (no dirty flag: net state
                    // is unchanged).
                    const current = state.variantGroupId;
                    setState("variantGroupId", newGroupId);
                    setState("variantGroupId", current);
                    return;
                  }
                  // Clear the old group's entries so switching back never
                  // shows deleted code as if it were still persisted.
                  for (const item of oldItems) {
                    for (const tp of p.dictionary.timePoints) {
                      setState(
                        "variantCode",
                        variantKey(tp.timePoint, item.id),
                        "",
                      );
                    }
                  }
                }
                setState("variantGroupId", newGroupId);
                markDirty();
              }}
              options={[
                {
                  value: "",
                  label: t3({
                    en: "— None —",
                    fr: "— Aucun —",
                    pt: "— Nenhum —",
                  }),
                },
                ...p.variantGroups.map((g) => ({
                  value: g.id,
                  label: g.label,
                })),
              ]}
            />
            <RadioGroup
              label={t3({ en: "Type", fr: "Type", pt: "Tipo" })}
              value={state.type}
              onChange={(v) => {
                setState("type", v as "binary" | "numeric");
                markDirty();
              }}
              options={[
                {
                  value: "binary",
                  label: t3({ en: "Boolean", fr: "Booléen", pt: "Booleano" }),
                },
                {
                  value: "numeric",
                  label: t3({ en: "Numeric", fr: "Numérique", pt: "Numérico" }),
                },
              ]}
            />
            <RadioGroup
              label={t3({
                en: "Aggregation",
                fr: "Agrégation",
                pt: "Agregação",
              })}
              value={state.aggregation}
              onChange={(v) => {
                setState("aggregation", v as "sum" | "avg");
                markDirty();
              }}
              options={[
                {
                  value: "sum",
                  label: t3({ en: "Sum", fr: "Somme", pt: "Soma" }),
                },
                {
                  value: "avg",
                  label: t3({ en: "Average", fr: "Moyenne", pt: "Média" }),
                },
              ]}
            />
          </div>
          <Input
            label={t3({
              en: "Short label",
              fr: "Libellé court",
              pt: "Etiqueta curta",
            })}
            value={state.shortLabel}
            onChange={(v) => {
              setState("shortLabel", v);
              markDirty();
            }}
            fullWidth
          />
          <Input
            label={t3({
              en: "Long label",
              fr: "Libellé long",
              pt: "Etiqueta longa",
            })}
            value={state.definition}
            onChange={(v) => {
              setState("definition", v);
              markDirty();
            }}
            fullWidth
          />
        </div>
      </div>

      <div class="flex min-h-0 flex-1">
        <div class="flex h-full w-48 flex-none flex-col overflow-auto border-r">
          <div class="ui-pad-sm ui-text-heading">
            {t3({
              en: "Time points",
              fr: "Points temporels",
              pt: "Pontos temporais",
            })}
          </div>
          <For each={p.dictionary.timePoints}>
            {(tp) => {
              const codeEntry = () =>
                state.code.find((c) => c.timePoint === tp.timePoint);
              const hasCode = () => !!codeEntry()?.rCode.trim();
              return (
                <button
                  class={`ui-pad-sm w-full cursor-pointer border-b text-left text-sm ${
                    selectedTimePoint() === tp.timePoint
                      ? "bg-primary-subtle font-700"
                      : "ui-hoverable-base-100"
                  }`}
                  onClick={() => setSelectedTimePoint(tp.timePoint)}
                >
                  <div>{tp.timePoint}</div>
                  <div class="text-base-content-muted text-xs">
                    {hasCode() ? "" : t3({
                      en: "no code",
                      fr: "aucun code",
                      pt: "sem código",
                    })}
                  </div>
                </button>
              );
            }}
          </For>
        </div>

        <div class="flex min-w-0 flex-1 flex-col overflow-auto">
          <Show
            when={currentTpIndex() >= 0}
            fallback={
              <div class="ui-pad">
                {t3({
                  en: "Select a time point",
                  fr: "Sélectionner un point temporel",
                  pt: "Selecionar um ponto temporal",
                })}
              </div>
            }
          >
            <div class="ui-pad ui-gap flex h-full">
              <div class="ui-spy w-1/2 flex-none">
                <div>
                  <TextArea
                    label={t3({
                      en: `Indicator code (${
                        state.type === "binary"
                          ? "should evaluate to yes/no"
                          : "should evaluate to a number"
                      })`,
                      fr: `Code de l'indicateur (${
                        state.type === "binary"
                          ? "doit donner oui/non"
                          : "doit donner un nombre"
                      })`,
                      pt: `Código do indicador (${
                        state.type === "binary"
                          ? "deve dar sim/não"
                          : "deve dar um número"
                      })`,
                    })}
                    value={state.code[currentTpIndex()].rCode}
                    onChange={(v) => {
                      setState("code", currentTpIndex(), "rCode", v);
                      markDirty();
                    }}
                    fullWidth
                    height="120px"
                    mono
                  />
                  <div class="text-base-content-muted mt-1 text-xs">
                    {t3({
                      en: "Operators: ",
                      fr: "Opérateurs : ",
                      pt: "Operadores: ",
                    })}
                    <span class="font-mono">
                      {[...HFA_CODE_SYMBOLS, ...HFA_CODE_WORDS].join(" ")}
                    </span>
                    {". "}
                    <span class="font-mono">{HFA_CODE_LIST_EXAMPLE}</span>
                    {t3({
                      en:
                        ' tests a list of values. Text is written in quotes, as in sh_03 == "c". Nothing else is accepted.',
                      fr:
                        " teste une liste de valeurs. Le texte s'écrit entre guillemets, comme dans sh_03 == \"c\". Rien d'autre n'est accepté.",
                      pt:
                        ' testa uma lista de valores. O texto escreve-se entre aspas, como em sh_03 == "c". Nada mais é aceite.',
                    })}
                  </div>
                  <CodeFieldMessages
                    issues={fieldIssues(selectedTimePoint(), "rCode")}
                    referenced={referencedIds(
                      state.code[currentTpIndex()].rCode,
                    )}
                    describe={describeReferenced}
                  />
                </div>

                <div>
                  <TextArea
                    label={t3({
                      en: "Filter code (optional, should evaluate to yes/no)",
                      fr: "Code filtre (optionnel, doit donner oui/non)",
                      pt: "Código de filtro (opcional, deve dar sim/não)",
                    })}
                    value={state.code[currentTpIndex()].rFilterCode}
                    onChange={(v) => {
                      setState("code", currentTpIndex(), "rFilterCode", v);
                      markDirty();
                    }}
                    fullWidth
                    height="80px"
                    mono
                  />
                  <CodeFieldMessages
                    issues={fieldIssues(selectedTimePoint(), "rFilterCode")}
                    referenced={referencedIds(
                      state.code[currentTpIndex()].rFilterCode,
                    )}
                    describe={describeReferenced}
                  />
                </div>

                <Show when={currentGroupItems().length > 0}>
                  <div class="ui-spy-sm border-t pt-3">
                    <div class="ui-text-heading">
                      {t3({
                        en:
                          "Variant items (per-item numerator, shares this time point's filter code)",
                        fr:
                          "Éléments de variante (numérateur par élément, partage le code filtre de ce point temporel)",
                        pt:
                          "Itens de variante (numerador por item, partilha o código de filtro deste ponto temporal)",
                      })}
                    </div>
                    <For each={currentGroupItems()}>
                      {(item) => {
                        const key = () =>
                          variantKey(selectedTimePoint(), item.id);
                        return (
                          <div>
                            <TextArea
                              label={`${item.label} (${item.id})`}
                              value={state.variantCode[key()] ?? ""}
                              onChange={(v) => {
                                setState("variantCode", key(), v);
                                markDirty();
                              }}
                              fullWidth
                              height="80px"
                              mono
                            />
                            <CodeFieldMessages
                              issues={fieldIssues(
                                selectedTimePoint(),
                                "variantCode",
                                item.id,
                              )}
                              referenced={[]}
                              describe={describeReferenced}
                            />
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>

                <div class="ui-gap-sm flex items-center">
                  <Button
                    onClick={applyToOtherRounds}
                    intent="neutral"
                    iconName="copy"
                  >
                    {t3({
                      en: "Apply to other rounds",
                      fr: "Appliquer aux autres rounds",
                      pt: "Aplicar às outras rondas",
                    })}
                  </Button>
                  <div class="text-xs">
                    <Show when={roundsConsistency() === "same"}>
                      <span class="text-success font-700">
                        {t3({
                          en: "All rounds identical",
                          fr: "Tous les rounds identiques",
                          pt: "Todas as rondas idênticas",
                        })}
                      </span>
                    </Show>
                    <Show when={roundsConsistency() === "different"}>
                      <span class="text-warning font-700">
                        {t3({
                          en: "Rounds differ",
                          fr: "Les rounds diffèrent",
                          pt: "As rondas diferem",
                        })}
                      </span>
                    </Show>
                  </div>
                </div>
              </div>
              <div class="flex h-full w-0 flex-1 flex-col">
                <div class="ui-gap-sm mb-2 flex items-center">
                  <div class="font-700 flex-none text-sm">
                    {t3({
                      en: "Available variables",
                      fr: "Variables disponibles",
                      pt: "Variáveis disponíveis",
                    })}
                  </div>
                  <Input
                    value={variableSearch()}
                    onChange={setVariableSearch}
                    placeholder={t3({
                      en: "Search variables...",
                      fr: "Rechercher des variables...",
                      pt: "Pesquisar variáveis...",
                    })}
                    searchIcon
                    clearable
                    fullWidth
                  />
                </div>
                <div class="bg-base-200 overflow-auto rounded p-2">
                  <Show when={currentTpDict()}>
                    {(dict) => (
                      <For
                        each={dict().variables.filter(
                          (v) =>
                            searchMatches(
                              `${v.variableId} ${v.variableLabel}`,
                            ),
                        )}
                      >
                        {(v) => {
                          const vals = dict().values.filter(
                            (vv) => vv.variableId === v.variableId,
                          );
                          return (
                            <div class="border-b py-1 last:border-b-0">
                              <div class="flex items-baseline gap-2 text-xs">
                                <span
                                  class="ui-hoverable-base-200 font-700 font-mono"
                                  onClick={() => insertSymbol(v.variableId)}
                                >
                                  {v.variableId}
                                </span>
                                <span class="text-base-content-muted truncate">
                                  {v.variableLabel}
                                </span>
                                <span class="text-base-content-muted flex-none">
                                  {v.variableType}
                                </span>
                              </div>
                              <Show when={vals.length > 0}>
                                <div class="text-base-content-muted ml-3 text-xs">
                                  {vals
                                    .map((vv) => `${vv.value}=${vv.valueLabel}`)
                                    .join(", ")}
                                </div>
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                    )}
                  </Show>
                  <Show when={otherIndicators.length > 0}>
                    <div class="ui-text-heading mt-3 mb-1">
                      {t3({
                        en: "Other indicators",
                        fr: "Autres indicateurs",
                        pt: "Outros indicadores",
                      })}
                    </div>
                    <For
                      each={otherIndicators.filter((i) =>
                        searchMatches(composeHfaIndicatorLabel(i, "full"))
                      )}
                    >
                      {(i) => (
                        <div class="border-b py-1 text-xs last:border-b-0">
                          <span
                            class="ui-hoverable-base-200"
                            onClick={() => insertSymbol(i.indicatorId)}
                          >
                            {composeHfaIndicatorLabel(i, "full")}
                          </span>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}

// A code field's issues, translated here at render, and the ids it names with
// their labels and options.
function CodeFieldMessages(p: {
  issues: HfaFieldIssue[];
  referenced: string[];
  describe: (id: string) => { label: string | undefined; values: string };
}) {
  return (
    <Show when={p.issues.length > 0 || p.referenced.length > 0}>
      <div class="mt-1">
        <For each={p.issues}>
          {(issue) => (
            <div
              class={issue.kind === "result_type"
                ? "text-warning text-xs"
                : issue.kind === "syntax"
                ? "text-danger font-700 text-xs"
                : "text-danger text-xs"}
            >
              <Show when={issue.kind === "syntax"}>
                {t3({ en: "Syntax: ", fr: "Syntaxe : ", pt: "Sintaxe: " })}
              </Show>
              {t3(issue.text)}
            </div>
          )}
        </For>
        <For each={p.referenced}>
          {(id) => {
            const described = p.describe(id);
            return (
              <div class="text-success text-xs">
                <div>
                  {id}
                  {described.label ? ` — ${described.label}` : ""}
                </div>
                <Show when={described.values !== ""}>
                  <div class="text-base-content-muted ml-3">
                    {described.values}
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </Show>
  );
}
