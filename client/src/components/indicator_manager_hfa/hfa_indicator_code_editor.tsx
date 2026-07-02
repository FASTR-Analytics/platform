import {
  t3,
  type APIResponseNoData,
  type HfaDictionaryForValidation,
  type HfaIndicator,
  type HfaIndicatorCategory,
  type HfaIndicatorServiceCategory,
  type HfaIndicatorSubCategory,
  type HfaIndicatorCode,
} from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  Input,
  MultiSelect,
  RadioGroup,
  Select,
  StateHolderWrapper,
  TextArea,
  createButtonAction,
  createQuery,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import {
  hasRCodeErrors,
  validateRCode,
  type RCodeValidationResult,
} from "./hfa_r_code_validator";

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
  code: TempCodeEntry[];
};

export function HfaIndicatorCodeEditor(
  p: EditorComponentProps<
    {
      indicator: HfaIndicator;
      dictionary: HfaDictionaryForValidation;
      allIndicatorVarNames: string[];
      categories: HfaIndicatorCategory[];
      subCategories: HfaIndicatorSubCategory[];
      serviceCategories: HfaIndicatorServiceCategory[];
    },
    undefined
  >,
) {
  const codeQuery = createQuery(
    () => serverActions.getHfaIndicatorCode({ varName: p.indicator.varName }),
    t3({ en: "Loading code...", fr: "Chargement du code..." }),
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
        <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
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
              {t3({ en: "Save and close", fr: "Sauvegarder et quitter" })}
            </Button>
            <Button
              intent="success"
              iconName="save"
              onClick={save.click}
              state={save.state()}
            >
              {t3({ en: "Save", fr: "Sauvegarder" })}
            </Button>
            <Button intent="neutral" onClick={() => p.close(undefined)}>
              {t3({ en: "Cancel", fr: "Annuler" })}
            </Button>
          </Show>
          <div class="font-700 flex-1 truncate text-xl">
            <span class="font-mono">{p.indicator.varName}</span>
            <span class="font-400 ml-4">{p.indicator.definition}</span>
          </div>
        </div>
      }
    >
      <StateHolderWrapper state={codeQuery.state()}>
        {(codeSnippets) => (
          <EditorInner
            indicator={p.indicator}
            dictionary={p.dictionary}
            allIndicatorVarNames={p.allIndicatorVarNames}
            categories={p.categories}
            subCategories={p.subCategories}
            serviceCategories={p.serviceCategories}
            initialCodeSnippets={codeSnippets}
            setNeedsSaving={setNeedsSaving}
            registerSave={(fn) => {
              doSave = fn;
            }}
          />
        )}
      </StateHolderWrapper>
    </FrameTop>
  );
}

function EditorInner(p: {
  indicator: HfaIndicator;
  dictionary: HfaDictionaryForValidation;
  allIndicatorVarNames: string[];
  categories: HfaIndicatorCategory[];
  subCategories: HfaIndicatorSubCategory[];
  serviceCategories: HfaIndicatorServiceCategory[];
  initialCodeSnippets: HfaIndicatorCode[];
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

  const [state, setState] = createStore<TempState>({
    categoryId: p.indicator.categoryId,
    subCategoryId: p.indicator.subCategoryId,
    serviceCategoryIds: p.indicator.serviceCategoryIds,
    shortLabel: p.indicator.shortLabel,
    definition: p.indicator.definition,
    type: p.indicator.type,
    aggregation: p.indicator.aggregation,
    code: initialCode,
  });

  const filteredSubCategories = () => {
    if (!state.categoryId) return [];
    return p.subCategories.filter((sc) => sc.categoryId === state.categoryId);
  };

  const [selectedTimePoint, setSelectedTimePoint] = createSignal(
    p.dictionary.timePoints[0]?.timePoint ?? "",
  );

  const [varSearch, setVarSearch] = createSignal("");

  const otherIndicatorVarNames = new Set(
    p.allIndicatorVarNames.filter((v) => v !== p.indicator.varName),
  );

  const currentTpIndex = () =>
    state.code.findIndex((c) => c.timePoint === selectedTimePoint());

  const currentTpDict = () =>
    p.dictionary.timePoints.find((tp) => tp.timePoint === selectedTimePoint());

  const valuesForVar = (varName: string) => {
    const dict = currentTpDict();
    if (!dict) return [];
    return dict.values.filter((v) => v.varName === varName);
  };

  const roundsConsistency = () => {
    const nonEmpty = state.code.filter(
      (c) => c.rCode.trim() || c.rFilterCode.trim(),
    );
    if (nonEmpty.length <= 1) return "single" as const;
    const first = nonEmpty[0];
    const allSame = nonEmpty.every(
      (c) =>
        c.rCode.trim() === first.rCode.trim() &&
        c.rFilterCode.trim() === first.rFilterCode.trim(),
    );
    return allSame ? ("same" as const) : ("different" as const);
  };

  function applyToOtherRounds() {
    const idx = currentTpIndex();
    if (idx < 0) return;
    const src = state.code[idx];
    for (let i = 0; i < state.code.length; i++) {
      if (i === idx) continue;
      setState("code", i, "rCode", src.rCode);
      setState("code", i, "rFilterCode", src.rFilterCode);
    }
    markDirty();
  }

  const availableVarNames = () => {
    const dict = currentTpDict();
    if (!dict) return new Set<string>();
    return new Set(dict.vars.map((v) => v.varName));
  };

  const emptyValidation: RCodeValidationResult = {
    syntaxErrors: [],
    unknownVariableErrors: [],
    warnings: [],
    referencedVars: [],
  };

  const currentRCodeValidation = (): RCodeValidationResult => {
    const idx = currentTpIndex();
    if (idx < 0) return emptyValidation;
    return validateRCode(
      state.code[idx].rCode,
      availableVarNames(),
      otherIndicatorVarNames,
    );
  };

  const currentFilterValidation = (): RCodeValidationResult => {
    const idx = currentTpIndex();
    if (idx < 0) return emptyValidation;
    return validateRCode(
      state.code[idx].rFilterCode,
      availableVarNames(),
      otherIndicatorVarNames,
    );
  };

  p.registerSave(async () => {
    const filterOnly = state.code.find(
      (c) => c.rFilterCode.trim() && !c.rCode.trim(),
    );
    if (filterOnly) {
      return {
        success: false,
        err: t3({
          en: `Filter code requires R code for time point "${filterOnly.timePoint}"`,
          fr: `Le code filtre nécessite un code R pour le point temporel « ${filterOnly.timePoint} »`,
        }),
      };
    }

    // Compute validation across all timepoints
    let hasSyntaxError = false;
    for (let i = 0; i < state.code.length; i++) {
      const c = state.code[i];
      const tp = p.dictionary.timePoints.find(
        (t) => t.timePoint === c.timePoint,
      );
      const availableVars = tp
        ? new Set(tp.vars.map((v) => v.varName))
        : new Set<string>();
      if (c.rCode.trim()) {
        const result = validateRCode(
          c.rCode,
          availableVars,
          otherIndicatorVarNames,
        );
        if (hasRCodeErrors(result)) {
          hasSyntaxError = true;
          break;
        }
      }
      if (c.rFilterCode.trim()) {
        const result = validateRCode(
          c.rFilterCode,
          availableVars,
          otherIndicatorVarNames,
        );
        if (hasRCodeErrors(result)) {
          hasSyntaxError = true;
          break;
        }
      }
    }

    const codeConsistent = roundsConsistency() !== "different";

    return await serverActions.saveHfaIndicatorFull({
      oldVarName: p.indicator.varName,
      indicator: {
        varName: p.indicator.varName,
        categoryId: state.categoryId,
        subCategoryId: state.subCategoryId,
        serviceCategoryIds: state.serviceCategoryIds,
        shortLabel: state.shortLabel.trim(),
        definition: state.definition.trim(),
        type: state.type,
        aggregation: state.aggregation,
        sortOrder: p.indicator.sortOrder,
        hasSyntaxError,
        codeConsistent,
      },
      code: unwrap(state.code).map((c) => ({
        timePoint: c.timePoint,
        rCode: c.rCode.trim(),
        rFilterCode: c.rFilterCode.trim() || undefined,
      })),
      hasSyntaxError,
      codeConsistent,
    });
  });

  function markDirty() {
    p.setNeedsSaving(true);
  }

  return (
    <div class="flex h-full flex-col">
      <div class="border-base-300 flex-none border-b">
        <div class="ui-pad ui-spy-sm">
          <div class="flex items-end gap-4">
            <div>
              <div class="ui-label">
                {t3({ en: "Variable name", fr: "Nom de variable" })}
              </div>
              <div class="ui-form-pad ui-form-text-size font-mono">
                {p.indicator.varName}
              </div>
            </div>
            <Select
              label={t3({ en: "Category", fr: "Catégorie" })}
              value={state.categoryId ?? ""}
              onChange={(v) => {
                setState("categoryId", v || null);
                setState("subCategoryId", null);
                markDirty();
              }}
              options={[
                { value: "", label: t3({ en: "— None —", fr: "— Aucune —" }) },
                ...p.categories.map((c) => ({ value: c.id, label: c.label })),
              ]}
            />
            <Select
              label={t3({ en: "Sub-category", fr: "Sous-catégorie" })}
              value={state.subCategoryId ?? ""}
              onChange={(v) => {
                setState("subCategoryId", v || null);
                markDirty();
              }}
              options={
                state.categoryId
                  ? [
                      { value: "", label: t3({ en: "— None —", fr: "— Aucune —" }) },
                      ...filteredSubCategories().map((sc) => ({ value: sc.id, label: sc.label })),
                    ]
                  : [{ value: "", label: t3({ en: "— Select category first —", fr: "— Sélectionnez d'abord une catégorie —" }) }]
              }
            />
            <MultiSelect
              label={t3({ en: "Service categories", fr: "Catégories de service" })}
              values={state.serviceCategoryIds}
              onChange={(v) => {
                setState("serviceCategoryIds", v);
                markDirty();
              }}
              options={p.serviceCategories.map((sc) => ({ value: sc.id, label: sc.label }))}
            />
            <RadioGroup
              label={t3({ en: "Type", fr: "Type" })}
              value={state.type}
              onChange={(v) => {
                setState("type", v as "binary" | "numeric");
                markDirty();
              }}
              options={[
                {
                  value: "binary",
                  label: t3({ en: "Boolean", fr: "Booléen" }),
                },
                {
                  value: "numeric",
                  label: t3({ en: "Numeric", fr: "Numérique" }),
                },
              ]}
            />
            <RadioGroup
              label={t3({ en: "Aggregation", fr: "Agrégation" })}
              value={state.aggregation}
              onChange={(v) => {
                setState("aggregation", v as "sum" | "avg");
                markDirty();
              }}
              options={[
                { value: "sum", label: t3({ en: "Sum", fr: "Somme" }) },
                { value: "avg", label: t3({ en: "Average", fr: "Moyenne" }) },
              ]}
            />
          </div>
          <Input
            label={t3({ en: "Short label", fr: "Libellé court" })}
            value={state.shortLabel}
            onChange={(v) => {
              setState("shortLabel", v);
              markDirty();
            }}
            fullWidth
          />
          <Input
            label={t3({ en: "Long label", fr: "Libellé long" })}
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
        <div class="border-base-300 flex h-full w-48 flex-none flex-col overflow-auto border-r">
          <div class="ui-pad-sm font-700 text-sm">
            {t3({ en: "Time points", fr: "Points temporels" })}
          </div>
          <For each={p.dictionary.timePoints}>
            {(tp) => {
              const codeEntry = () =>
                state.code.find((c) => c.timePoint === tp.timePoint);
              const hasCode = () => !!codeEntry()?.rCode.trim();
              return (
                <button
                  class={`ui-pad-sm border-base-300 w-full border-b text-left text-sm ${
                    selectedTimePoint() === tp.timePoint
                      ? "bg-primary/10 font-700"
                      : "hover:bg-base-200"
                  }`}
                  onClick={() => setSelectedTimePoint(tp.timePoint)}
                >
                  <div>{tp.timePoint}</div>
                  <div class="text-base-content/50 text-xs">
                    {hasCode() ? "" : t3({ en: "no code", fr: "aucun code" })}
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
                })}
              </div>
            }
          >
            <div class="ui-pad ui-gap flex h-full">
              <div class="ui-spy w-1/2 flex-none">
                <div>
                  <TextArea
                    label={t3({
                      en: `R code (${state.type === "binary" ? "should evaluate to TRUE/FALSE" : "should evaluate to numeric"})`,
                      fr: `Code R (${state.type === "binary" ? "doit évaluer à TRUE/FALSE" : "doit évaluer à numérique"})`,
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
                  <Show
                    when={
                      currentRCodeValidation().referencedVars.length > 0 ||
                      currentRCodeValidation().warnings.length > 0 ||
                      currentRCodeValidation().unknownVariableErrors.length >
                        0 ||
                      currentRCodeValidation().syntaxErrors.length > 0
                    }
                  >
                    <div class="mt-1">
                      <For each={currentRCodeValidation().syntaxErrors}>
                        {(e) => (
                          <div class="text-danger font-700 text-xs">
                            {t3({ en: "Syntax: ", fr: "Syntaxe : " })}
                            {e}
                          </div>
                        )}
                      </For>
                      <For each={currentRCodeValidation().unknownVariableErrors}>
                        {(e) => <div class="text-danger text-xs">{e}</div>}
                      </For>
                      <For each={currentRCodeValidation().referencedVars}>
                        {(varName) => {
                          const varInfo = currentTpDict()?.vars.find(
                            (v) => v.varName === varName,
                          );
                          const vals = valuesForVar(varName);
                          return (
                            <div class="text-success text-xs">
                              <div>
                                {varName}
                                {varInfo ? ` — ${varInfo.varLabel}` : ""}
                              </div>
                              <Show when={vals.length > 0}>
                                <div class="text-base-content/60 ml-3">
                                  {vals
                                    .map((vv) => `${vv.value}=${vv.valueLabel}`)
                                    .join(", ")}
                                </div>
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                      <For each={currentRCodeValidation().warnings}>
                        {(w) => <div class="text-warning text-xs">{w}</div>}
                      </For>
                    </div>
                  </Show>
                </div>

                <div>
                  <TextArea
                    label={t3({
                      en: "Filter code (optional, should evaluate to TRUE/FALSE)",
                      fr: "Code filtre (optionnel, doit évaluer à TRUE/FALSE)",
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
                  <Show
                    when={
                      state.code[currentTpIndex()].rFilterCode.trim() &&
                      !state.code[currentTpIndex()].rCode.trim()
                    }
                  >
                    <div class="text-danger font-700 mt-1 text-xs">
                      {t3({
                        en: "Filter code requires R code for this time point",
                        fr: "Le code filtre nécessite un code R pour ce point temporel",
                      })}
                    </div>
                  </Show>
                  <Show
                    when={
                      currentFilterValidation().referencedVars.length > 0 ||
                      currentFilterValidation().warnings.length > 0 ||
                      currentFilterValidation().unknownVariableErrors.length >
                        0 ||
                      currentFilterValidation().syntaxErrors.length > 0
                    }
                  >
                    <div class="mt-1">
                      <For each={currentFilterValidation().syntaxErrors}>
                        {(e) => (
                          <div class="text-danger font-700 text-xs">
                            {t3({ en: "Syntax: ", fr: "Syntaxe : " })}
                            {e}
                          </div>
                        )}
                      </For>
                      <For each={currentFilterValidation().unknownVariableErrors}>
                        {(e) => <div class="text-danger text-xs">{e}</div>}
                      </For>
                      <For each={currentFilterValidation().referencedVars}>
                        {(varName) => {
                          const varInfo = currentTpDict()?.vars.find(
                            (v) => v.varName === varName,
                          );
                          const vals = valuesForVar(varName);
                          return (
                            <div class="text-success text-xs">
                              <div>
                                {varName}
                                {varInfo ? ` — ${varInfo.varLabel}` : ""}
                              </div>
                              <Show when={vals.length > 0}>
                                <div class="text-base-content/60 ml-3">
                                  {vals
                                    .map((vv) => `${vv.value}=${vv.valueLabel}`)
                                    .join(", ")}
                                </div>
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                      <For each={currentFilterValidation().warnings}>
                        {(w) => <div class="text-warning text-xs">{w}</div>}
                      </For>
                    </div>
                  </Show>
                </div>

                <div class="ui-gap-sm flex items-center">
                  <Button
                    onClick={applyToOtherRounds}
                    intent="neutral"
                    iconName="copy"
                  >
                    {t3({
                      en: "Apply to other rounds",
                      fr: "Appliquer aux autres rounds",
                    })}
                  </Button>
                  <div class="text-xs">
                    <Show when={roundsConsistency() === "same"}>
                      <span class="text-success font-700">
                        {t3({
                          en: "All rounds identical",
                          fr: "Tous les rounds identiques",
                        })}
                      </span>
                    </Show>
                    <Show when={roundsConsistency() === "different"}>
                      <span class="text-warning font-700">
                        {t3({
                          en: "Rounds differ",
                          fr: "Les rounds diffèrent",
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
                    })}
                  </div>
                  <Input
                    value={varSearch()}
                    onChange={setVarSearch}
                    placeholder={t3({
                      en: "Search variables...",
                      fr: "Rechercher des variables...",
                    })}
                    searchIcon
                    fullWidth
                  />
                </div>
                <div class="bg-base-200 overflow-auto rounded p-2">
                  <Show when={currentTpDict()}>
                    {(dict) => (
                      <For
                        each={dict().vars.filter((v) => {
                          const q = varSearch().trim().toLowerCase();
                          if (!q) return true;
                          return (
                            v.varName.toLowerCase().includes(q) ||
                            v.varLabel.toLowerCase().includes(q)
                          );
                        })}
                      >
                        {(v) => {
                          const vals = dict().values.filter(
                            (vv) => vv.varName === v.varName,
                          );
                          return (
                            <div class="border-base-300/50 border-b py-1 last:border-b-0">
                              <div class="flex items-baseline gap-2 text-xs">
                                <span
                                  class="ui-hoverable font-700 cursor-pointer font-mono"
                                  onClick={() => {
                                    setState(
                                      "code",
                                      currentTpIndex(),
                                      "rCode",
                                      (prev) =>
                                        prev +
                                        (prev.length === 0 || /\s$/.test(prev)
                                          ? ""
                                          : " ") +
                                        v.varName +
                                        " ",
                                    );
                                    markDirty();
                                  }}
                                >
                                  {v.varName}
                                </span>
                                <span class="text-base-content/60 truncate">
                                  {v.varLabel}
                                </span>
                                <span class="text-base-content/40 flex-none">
                                  {v.varType}
                                </span>
                              </div>
                              <Show when={vals.length > 0}>
                                <div class="text-base-content/60 ml-3 text-xs">
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
                </div>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
