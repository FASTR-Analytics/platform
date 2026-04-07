import {
  t3,
  type HfaDictionaryForValidation,
  type HfaIndicator,
  type HfaIndicatorCode,
} from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  Input,
  RadioGroup,
  StateHolderWrapper,
  TextArea,
  timQuery,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import {
  validateRCode,
  type RCodeValidationResult,
} from "./hfa_r_code_validator";

type TempCodeEntry = {
  timePoint: string;
  rCode: string;
  rFilterCode: string;
};

type TempState = {
  varName: string;
  category: string;
  definition: string;
  type: "binary" | "numeric";
  code: TempCodeEntry[];
};

export function HfaIndicatorCodeEditor(
  p: EditorComponentProps<
    {
      indicator: HfaIndicator;
      dictionary: HfaDictionaryForValidation;
      allIndicatorVarNames: string[];
    },
    undefined
  >,
) {
  const codeQuery = timQuery(
    () => serverActions.getHfaIndicatorCode({ varName: p.indicator.varName }),
    t3({ en: "Loading code...", fr: "Chargement du code..." }),
  );

  const [needsSaving, setNeedsSaving] = createSignal(false);
  let doSave: (() => Promise<void>) | undefined;

  async function handleSaveAndClose() {
    if (doSave) await doSave();
    p.close(undefined);
  }

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
              intent="success"
              iconName="save"
              onClick={handleSaveAndClose}
            >
              {t3({ en: "Save and close", fr: "Sauvegarder et quitter" })}
            </Button>
            <Button intent="neutral" onClick={() => p.close(undefined)}>
              {t3({ en: "Discard", fr: "Annuler" })}
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
  initialCodeSnippets: HfaIndicatorCode[];
  setNeedsSaving: (v: boolean) => void;
  registerSave: (fn: () => Promise<void>) => void;
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
    varName: p.indicator.varName,
    category: p.indicator.category,
    definition: p.indicator.definition,
    type: p.indicator.type,
    code: initialCode,
  });

  const [selectedTimePoint, setSelectedTimePoint] = createSignal(
    p.dictionary.timePoints[0]?.timePoint ?? "",
  );

  const otherIndicatorVarNames = new Set(
    p.allIndicatorVarNames.filter((v) => v !== p.indicator.varName),
  );

  const currentTpIndex = () =>
    state.code.findIndex((c) => c.timePoint === selectedTimePoint());

  const currentTpDict = () =>
    p.dictionary.timePoints.find((tp) => tp.timePoint === selectedTimePoint());

  const availableVarNames = () => {
    const dict = currentTpDict();
    if (!dict) return new Set<string>();
    return new Set(dict.vars.map((v) => v.varName));
  };

  const currentRCodeValidation = (): RCodeValidationResult => {
    const idx = currentTpIndex();
    if (idx < 0) return { warnings: [], referencedVars: [] };
    return validateRCode(
      state.code[idx].rCode,
      availableVarNames(),
      otherIndicatorVarNames,
    );
  };

  const currentFilterValidation = (): RCodeValidationResult => {
    const idx = currentTpIndex();
    if (idx < 0) return { warnings: [], referencedVars: [] };
    return validateRCode(
      state.code[idx].rFilterCode,
      availableVarNames(),
      otherIndicatorVarNames,
    );
  };

  p.registerSave(async () => {
    const trimmedVarName = state.varName.trim();
    if (!trimmedVarName) return;
    await serverActions.saveHfaIndicatorFull({
      oldVarName: p.indicator.varName,
      indicator: {
        varName: trimmedVarName,
        category: state.category.trim(),
        definition: state.definition.trim(),
        type: state.type,
        sortOrder: p.indicator.sortOrder,
      },
      code: unwrap(state.code).map((c) => ({
        timePoint: c.timePoint,
        rCode: c.rCode.trim(),
        rFilterCode: c.rFilterCode.trim() || undefined,
      })),
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
            <Input
              label={t3({ en: "Variable name", fr: "Nom de variable" })}
              value={state.varName}
              onChange={(v) => {
                setState("varName", v);
                markDirty();
              }}
              mono
            />
            <Input
              label={t3({ en: "Category", fr: "Catégorie" })}
              value={state.category}
              onChange={(v) => {
                setState("category", v);
                markDirty();
              }}
            />
            <RadioGroup
              label={t3({ en: "Type", fr: "Type" })}
              value={state.type}
              onChange={(v) => {
                setState("type", v as "binary" | "numeric");
                markDirty();
              }}
              options={[
                { value: "binary", label: t3({ en: "Boolean", fr: "Booléen" }) },
                { value: "numeric", label: t3({ en: "Numeric", fr: "Numérique" }) },
              ]}
            />
          </div>
          <Input
            label={t3({ en: "Definition", fr: "Définition" })}
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
          <div class="ui-pad-sm font-700 text-sm">{t3({ en: "Time points", fr: "Points temporels" })}</div>
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
                  <div>{tp.timePointLabel}</div>
                  <div class="text-base-content/50 text-xs">
                    {tp.timePoint}
                    {hasCode() ? "" : ` (${t3({ en: "no code", fr: "aucun code" })})`}
                  </div>
                </button>
              );
            }}
          </For>
        </div>

        <div class="flex min-w-0 flex-1 flex-col overflow-auto">
          <Show
            when={currentTpIndex() >= 0}
            fallback={<div class="ui-pad">{t3({ en: "Select a time point", fr: "Sélectionner un point temporel" })}</div>}
          >
            <div class="ui-pad ui-gap flex h-full">
              <div class="ui-spy w-1/2">
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
                  <Show when={currentRCodeValidation().referencedVars.length > 0 || currentRCodeValidation().warnings.length > 0}>
                    <div class="mt-1">
                      <For each={currentRCodeValidation().referencedVars}>
                        {(varName) => {
                          const varInfo = currentTpDict()?.vars.find((v) => v.varName === varName);
                          return (
                            <div class="text-success text-xs">
                              {varName}{varInfo ? ` — ${varInfo.varLabel}` : ""}
                            </div>
                          );
                        }}
                      </For>
                      <For each={currentRCodeValidation().warnings}>
                        {(w) => <div class="text-danger text-xs">{w}</div>}
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
                  <Show when={currentFilterValidation().referencedVars.length > 0 || currentFilterValidation().warnings.length > 0}>
                    <div class="mt-1">
                      <For each={currentFilterValidation().referencedVars}>
                        {(varName) => {
                          const varInfo = currentTpDict()?.vars.find((v) => v.varName === varName);
                          return (
                            <div class="text-success text-xs">
                              {varName}{varInfo ? ` — ${varInfo.varLabel}` : ""}
                            </div>
                          );
                        }}
                      </For>
                      <For each={currentFilterValidation().warnings}>
                        {(w) => <div class="text-danger text-xs">{w}</div>}
                      </For>
                    </div>
                  </Show>
                </div>
              </div>
              <div class="flex h-full flex-1 flex-col">
                <div class="font-700 mb-2 text-sm">
                  {t3({ en: "Available variables", fr: "Variables disponibles" })}
                </div>
                <div class="bg-base-200 overflow-auto rounded p-2">
                  <Show when={currentTpDict()}>
                    {(dict) => (
                      <For each={dict().vars}>
                        {(v) => (
                          <div class="flex items-baseline gap-2 py-0.5 text-xs">
                            <span
                              class="ui-hoverable font-700 cursor-pointer font-mono"
                              onClick={() => {
                                setState(
                                  "code",
                                  currentTpIndex(),
                                  "rCode",
                                  (prev) => prev + v.varName,
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
                        )}
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
