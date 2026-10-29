import {
  getMergedModuleConfigSelections,
  type ModuleDefaultsBaselineEntry,
  type ModuleParameter,
  type RunGenerationDefaults,
  type RunGenerationModuleOption,
  type RunGenerationModuleOptions,
  type RunGenerationStep1Result,
  t3,
} from "lib";
import {
  Button,
  Checkbox,
  createFormAction,
  createQuery,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderFormError,
  StateHolderWrapper,
} from "panther";
import { batch, createSignal, For, type JSX, Show } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import {
  BaselineMarker,
  getModuleParameterInvalidMsg,
  ModuleParameterInputs,
} from "./_shared/mod.ts";
import { serverActions } from "~/server_actions";
import {
  copilotViewController,
  holdCopilotView,
} from "~/components/instance/copilot/mod.ts";

// The instance's module-defaults editor (S8 "Instance module defaults"): the
// ONE writer of the `run_generation_defaults` store, which pre-fills the
// generation wizard (these defaults beat definition defaults). The wizard
// no longer edits parameter values, so this editor is the ONLY place they
// are set.
// Definitions are never stored: they are resolved live on open via the same
// read the wizard uses, and drift is absorbed by
// getMergedModuleConfigSelections on the next read. Params render for EVERY
// offerable module regardless of the default module set. The save is SPARSE
// by intent: it writes the already-stored values plus the values ADJUSTED in
// this session (dirty-tracked per field), so a param no admin ever touched
// is not stored and keeps following future definition-default changes,
// while a stored value stays pinned until explicitly changed. Per-module
// "Reset to definition defaults" is the unpin act: it drops the module's
// stored entry so every one of its params follows the definition again.
// Stored entries
// for modules not offerable here (country-filtered or removed) pass through
// verbatim on save (the store tolerates unknown moduleIds by design), as
// do stored keys a definition no longer declares.
// When the country has a frozen baseline (contract on
// ModuleDefaultsBaselineEntry), a field whose value differs from what a
// reset to it would show is marked, and resets per param, per module or all
// restore the baseline's STORED state: a param the baseline pinned is pinned
// to that value, one it left unpinned is unpinned again. Like the
// definition reset, these fill the form and land on save.
type Props = EditorComponentProps<Record<never, never>, undefined>;

type Family = keyof RunGenerationStep1Result;
const FAMILIES: Family[] = ["hmis", "hfa", "iceh"];

// Which entry a module's save starts from before this session's per-param
// edits and unpins apply: the stored one, none (definition reset), or the
// baseline's (module baseline reset).
type ModuleSaveBase = "stored" | "empty" | "baseline";

export function ModuleDefaultsEditor(p: Props) {
  holdCopilotView();
  copilotViewController.setView("module_defaults");

  const query = createQuery(
    async () => {
      const [optionsRes, defaultsRes, baselineRes] = await Promise.all([
        serverActions.getRunGenerationModuleOptions({}),
        serverActions.getRunGenerationDefaults({}),
        serverActions.getModuleDefaultsBaseline({}),
      ]);
      if (optionsRes.success === false) {
        return optionsRes;
      }
      if (defaultsRes.success === false) {
        return defaultsRes;
      }
      return {
        success: true as const,
        data: {
          options: optionsRes.data,
          defaults: defaultsRes.data,
          // A baseline read failure never blocks the editor: it just has no
          // baseline controls.
          baseline: baselineRes.success ? baselineRes.data.baseline : null,
        },
      };
    },
    t3({
      en: "Loading module definitions...",
      fr: "Chargement des définitions de modules...",
      pt: "A carregar as definições dos módulos...",
    }),
  );

  return (
    <FrameTop
      pad="md"
      spy="md"
      panelChildren={
        <HeadingBar
          tonal
          onBack={() => p.close(undefined)}
          heading={t3({
            en: "Module defaults",
            fr: "Paramètres par défaut des modules",
            pt: "Predefinições dos módulos",
          })}
        />
      }
    >
      <StateHolderWrapper state={query.state()}>
        {(keyed) => (
          <ModuleDefaultsInner
            options={keyed.options}
            defaults={keyed.defaults}
            baseline={keyed.baseline}
            close={p.close}
          />
        )}
      </StateHolderWrapper>
    </FrameTop>
  );
}

function ModuleDefaultsInner(p: {
  options: RunGenerationModuleOptions;
  defaults: RunGenerationDefaults;
  baseline: ModuleDefaultsBaselineEntry | null;
  close: (v: undefined) => void;
}) {
  const [families, setFamilies] = createStore<RunGenerationStep1Result>({
    hmis: p.defaults.step1?.hmis === true,
    hfa: p.defaults.step1?.hfa === true,
    iceh: p.defaults.step1?.iceh === true,
  });

  const offeredIds = new Set<string>(p.options.modules.map((o) => o.id));
  const [selected, setSelected] = createStore<Record<string, boolean>>(
    Object.fromEntries(
      p.defaults.moduleIds
        .filter((id) => offeredIds.has(id))
        .map((id) => [id, true]),
    ),
  );

  const [paramValues, setParamValues] = createStore<
    Record<string, Record<string, string>>
  >(
    Object.fromEntries(
      p.options.modules.map((o) => [
        o.id,
        getMergedModuleConfigSelections(
          {
            parameterDefinitions: [],
            parameterSelections: p.defaults.parameterSelections[o.id] ?? {},
          },
          { parameters: o.parameters },
        ).parameterSelections,
      ]),
    ),
  );

  // All three are read only at save time, so plain collections: no
  // reactivity needed. A per-param key is in at most one of dirtyParams
  // (write the form value) and unpinParams (drop the key); a reset decides
  // which, and adjusting a param afterwards makes it dirty again.
  const dirtyParams = new Set<string>();
  const unpinParams = new Set<string>();
  const moduleSaveBase = new Map<string, ModuleSaveBase>();
  const paramKey = (moduleId: string, replacementString: string) =>
    `${moduleId}|${replacementString}`;

  function clearModuleParamMarks(option: RunGenerationModuleOption): void {
    for (const param of option.parameters) {
      dirtyParams.delete(paramKey(option.id, param.replacementString));
      unpinParams.delete(paramKey(option.id, param.replacementString));
    }
  }

  function resetToDefaults(option: RunGenerationModuleOption): void {
    clearModuleParamMarks(option);
    batch(() => {
      for (const param of option.parameters) {
        setParamValues(
          option.id,
          param.replacementString,
          param.input.defaultValue,
        );
      }
    });
    moduleSaveBase.set(option.id, "empty");
  }

  // Baseline reads. A param's baseline value is what a reset to the baseline
  // would show: the baseline's pinned value, else the CURRENT definition
  // default it follows, so "changed" means exactly "a reset would change it".
  function baselinePinned(
    b: ModuleDefaultsBaselineEntry,
    moduleId: string,
    replacementString: string,
  ): string | undefined {
    return b.stored.parameterSelections[moduleId]?.[replacementString];
  }
  function baselineParamValue(
    b: ModuleDefaultsBaselineEntry,
    moduleId: string,
    param: ModuleParameter,
  ): string {
    return baselinePinned(b, moduleId, param.replacementString) ??
      param.input.defaultValue;
  }
  function baselineSelected(
    b: ModuleDefaultsBaselineEntry,
    moduleId: string,
  ): boolean {
    return b.stored.moduleIds.includes(moduleId);
  }
  function baselineFamily(b: ModuleDefaultsBaselineEntry, f: Family): boolean {
    return b.stored.step1?.[f] === true;
  }

  function moduleDiffers(
    b: ModuleDefaultsBaselineEntry,
    option: RunGenerationModuleOption,
  ): boolean {
    return (selected[option.id] === true) !==
        baselineSelected(b, option.id) ||
      option.parameters.some((param) =>
        paramValues[option.id][param.replacementString] !==
          baselineParamValue(b, option.id, param)
      );
  }
  function anyDiffers(b: ModuleDefaultsBaselineEntry): boolean {
    return FAMILIES.some((f) => families[f] !== baselineFamily(b, f)) ||
      p.options.modules.some((o) => moduleDiffers(b, o));
  }

  function resetParamToBaseline(
    b: ModuleDefaultsBaselineEntry,
    option: RunGenerationModuleOption,
    replacementString: string,
  ): void {
    const param = option.parameters.find((x) =>
      x.replacementString === replacementString
    );
    if (param === undefined) {
      return;
    }
    const key = paramKey(option.id, replacementString);
    if (baselinePinned(b, option.id, replacementString) !== undefined) {
      unpinParams.delete(key);
      dirtyParams.add(key);
    } else {
      dirtyParams.delete(key);
      unpinParams.add(key);
    }
    setParamValues(
      option.id,
      replacementString,
      baselineParamValue(b, option.id, param),
    );
  }

  function resetModuleToBaseline(
    b: ModuleDefaultsBaselineEntry,
    option: RunGenerationModuleOption,
  ): void {
    clearModuleParamMarks(option);
    batch(() => {
      setSelected(option.id, baselineSelected(b, option.id));
      for (const param of option.parameters) {
        setParamValues(
          option.id,
          param.replacementString,
          baselineParamValue(b, option.id, param),
        );
      }
    });
    moduleSaveBase.set(option.id, "baseline");
  }

  function resetAllToBaseline(b: ModuleDefaultsBaselineEntry): void {
    batch(() => {
      for (const f of FAMILIES) {
        setFamilies(f, baselineFamily(b, f));
      }
      for (const option of p.options.modules) {
        resetModuleToBaseline(b, option);
      }
    });
  }

  const save = createFormAction(
    async () => {
      const values = unwrap(paramValues);
      function savedEntriesFor(
        o: RunGenerationModuleOption,
      ): Record<string, string> {
        const base = moduleSaveBase.get(o.id) ?? "stored";
        const entries: Record<string, string> = base === "empty"
          ? {}
          : base === "baseline"
          ? { ...(p.baseline?.stored.parameterSelections[o.id] ?? {}) }
          : { ...(p.defaults.parameterSelections[o.id] ?? {}) };
        for (const param of o.parameters) {
          const key = paramKey(o.id, param.replacementString);
          if (unpinParams.has(key)) {
            delete entries[param.replacementString];
          } else if (dirtyParams.has(key)) {
            entries[param.replacementString] =
              values[o.id][param.replacementString];
          }
        }
        return entries;
      }

      const invalidLabels = p.options.modules
        .filter((o) => {
          const entries = savedEntriesFor(o);
          return o.parameters.some((param) =>
            entries[param.replacementString] !== undefined &&
            getModuleParameterInvalidMsg(
                param,
                entries[param.replacementString],
              ) !== undefined
          );
        })
        .map((o) => o.label);
      if (invalidLabels.length > 0) {
        return {
          success: false,
          err: `${
            t3({
              en: "Fix the invalid parameter values for",
              fr: "Corrigez les valeurs de paramètres non valides pour",
              pt: "Corrija os valores de parâmetros inválidos para",
            })
          }: ${invalidLabels.join(", ")}`,
        };
      }

      const passThroughIds = p.defaults.moduleIds.filter(
        (id) => !offeredIds.has(id),
      );
      const passThroughParams = Object.fromEntries(
        Object.entries(p.defaults.parameterSelections).filter(
          ([id]) => !offeredIds.has(id),
        ),
      );
      return await serverActions.saveRunGenerationDefaults({
        defaults: {
          step1: { ...unwrap(families) },
          moduleIds: [
            ...p.options.modules.filter((o) => selected[o.id]).map((o) => o.id),
            ...passThroughIds,
          ],
          parameterSelections: {
            ...passThroughParams,
            ...Object.fromEntries(
              p.options.modules.flatMap((o) => {
                const entries = savedEntriesFor(o);
                return Object.keys(entries).length > 0 ? [[o.id, entries]] : [];
              }),
            ),
          },
        },
      });
    },
    async () => p.close(undefined),
  );

  const yesNo = (v: boolean) =>
    v
      ? t3({ en: "Included", fr: "Inclus", pt: "Incluído" })
      : t3({ en: "Not included", fr: "Non inclus", pt: "Não incluído" });

  // A checkbox row with its baseline marker underneath when it differs.
  function CheckboxWithBaseline(c: {
    checkbox: JSX.Element;
    baselineValue: boolean | undefined;
    current: boolean;
    onReset: () => void;
  }) {
    return (
      <div class="ui-spy-sm">
        {c.checkbox}
        <Show
          when={c.baselineValue !== undefined &&
            c.baselineValue !== c.current}
        >
          <div class="pl-6">
            <BaselineMarker
              baselineText={yesNo(c.baselineValue === true)}
              onReset={c.onReset}
            />
          </div>
        </Show>
      </div>
    );
  }

  const familyLabel = (f: Family) =>
    f === "hmis"
      ? t3({ en: "HMIS data", fr: "Données HMIS", pt: "Dados HMIS" })
      : f === "hfa"
      ? t3({ en: "HFA data", fr: "Données FOSA", pt: "Dados HFA" })
      : t3({
        en: "ICEH equity data",
        fr: "Données d'équité ICEH",
        pt: "Dados de equidade ICEH",
      });

  return (
    <>
      <div class="text-base-content-muted max-w-2xl">
        {t3({
          en:
            "These defaults configure the generation wizard when a new results package is generated. Module parameter values are set only here and apply to every package that includes the module.",
          fr:
            "Ces valeurs par défaut configurent l'assistant de génération lors de la création d'un nouveau paquet de résultats. Les valeurs des paramètres des modules se règlent uniquement ici et s'appliquent à chaque paquet qui inclut le module.",
          pt:
            "Estas predefinições configuram o assistente de geração quando um novo pacote de resultados é gerado. Os valores dos parâmetros dos módulos definem-se apenas aqui e aplicam-se a todos os pacotes que incluam o módulo.",
        })}
      </div>

      <Show when={p.baseline} keyed>
        {(b) => (
          <div class="ui-pad ui-gap flex items-center rounded border">
            <div class="text-base-content-muted flex-1 text-sm">
              {anyDiffers(b)
                ? t3({
                  en:
                    "Some values differ from this country's baseline, the module defaults recorded for it when baselines were taken. Changed values are marked below.",
                  fr:
                    "Certaines valeurs diffèrent de la référence de ce pays, les paramètres par défaut des modules enregistrés lors de la prise des références. Les valeurs modifiées sont signalées ci-dessous.",
                  pt:
                    "Alguns valores diferem da referência deste país, as predefinições dos módulos registadas quando as referências foram tiradas. Os valores alterados estão assinalados abaixo.",
                })
                : t3({
                  en: "Every value matches this country's baseline.",
                  fr:
                    "Toutes les valeurs correspondent à la référence de ce pays.",
                  pt: "Todos os valores coincidem com a referência deste país.",
                })}
            </div>
            <Show when={anyDiffers(b)}>
              <Button
                size="sm"
                outline
                intent="neutral"
                iconName="refresh"
                onClick={() => resetAllToBaseline(b)}
              >
                {t3({
                  en: "Reset all to baseline",
                  fr: "Tout réinitialiser à la référence",
                  pt: "Repor tudo na referência",
                })}
              </Button>
            </Show>
          </div>
        )}
      </Show>

      <h3 class="ui-text-heading">
        {t3({
          en: "Default data families",
          fr: "Familles de données par défaut",
          pt: "Famílias de dados predefinidas",
        })}
      </h3>
      <div class="ui-pad ui-spy rounded border">
        <For each={FAMILIES}>
          {(f) => (
            <CheckboxWithBaseline
              checkbox={
                <Checkbox
                  label={familyLabel(f)}
                  checked={families[f]}
                  onChange={(v) => setFamilies(f, v)}
                />
              }
              baselineValue={p.baseline
                ? baselineFamily(p.baseline, f)
                : undefined}
              current={families[f]}
              onReset={() =>
                p.baseline && setFamilies(f, baselineFamily(p.baseline, f))}
            />
          )}
        </For>
      </div>

      <h3 class="ui-text-heading">
        {t3({
          en: "Default modules and parameters",
          fr: "Modules et paramètres par défaut",
          pt: "Módulos e parâmetros predefinidos",
        })}
      </h3>
      <div class="text-base-content-muted text-sm">
        {t3({
          en:
            "Checked modules are pre-selected in the wizard. Parameter values apply whenever the module is included.",
          fr:
            "Les modules cochés sont présélectionnés dans l'assistant. Les valeurs des paramètres s'appliquent chaque fois que le module est inclus.",
          pt:
            "Os módulos marcados são pré-selecionados no assistente. Os valores dos parâmetros aplicam-se sempre que o módulo é incluído.",
        })}
      </div>

      <For each={p.options.modules}>
        {(option) => (
          <div class="ui-pad ui-spy-sm rounded border">
            <div class="ui-gap flex items-center">
              <div class="flex-1">
                <CheckboxWithBaseline
                  checkbox={
                    <Checkbox
                      label={option.label}
                      checked={selected[option.id] === true}
                      onChange={(v) => setSelected(option.id, v)}
                    />
                  }
                  baselineValue={p.baseline
                    ? baselineSelected(p.baseline, option.id)
                    : undefined}
                  current={selected[option.id] === true}
                  onReset={() =>
                    p.baseline &&
                    setSelected(
                      option.id,
                      baselineSelected(p.baseline, option.id),
                    )}
                />
              </div>
              <Show when={p.baseline && moduleDiffers(p.baseline, option)}>
                <Button
                  size="sm"
                  outline
                  intent="neutral"
                  iconName="refresh"
                  onClick={() =>
                    p.baseline && resetModuleToBaseline(p.baseline, option)}
                >
                  {t3({
                    en: "Reset to baseline",
                    fr: "Réinitialiser à la référence",
                    pt: "Repor a referência",
                  })}
                </Button>
              </Show>
              <Show when={option.parameters.length > 0}>
                <Button
                  size="sm"
                  outline
                  intent="neutral"
                  iconName="refresh"
                  onClick={() => resetToDefaults(option)}
                >
                  {t3({
                    en: "Reset to definition defaults",
                    fr: "Réinitialiser aux valeurs par défaut de la définition",
                    pt: "Repor as predefinições da definição",
                  })}
                </Button>
              </Show>
            </div>
            <Show when={option.parameters.length > 0}>
              <ModuleParameterInputs
                parameters={option.parameters}
                values={paramValues[option.id]}
                onChange={(k, v) => {
                  unpinParams.delete(paramKey(option.id, k));
                  dirtyParams.add(paramKey(option.id, k));
                  setParamValues(option.id, k, v);
                }}
                baseline={p.baseline
                  ? {
                    valueFor: (k) => {
                      const param = option.parameters.find((x) =>
                        x.replacementString === k
                      );
                      return p.baseline && param
                        ? baselineParamValue(p.baseline, option.id, param)
                        : "";
                    },
                    onReset: (k) =>
                      p.baseline &&
                      resetParamToBaseline(p.baseline, option, k),
                  }
                  : undefined}
              />
            </Show>
          </div>
        )}
      </For>

      <StateHolderFormError state={save.state()} />

      <div class="ui-gap-sm flex">
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          iconName="save"
        >
          {t3({
            en: "Save defaults",
            fr: "Enregistrer les valeurs par défaut",
            pt: "Guardar as predefinições",
          })}
        </Button>
      </div>
    </>
  );
}
