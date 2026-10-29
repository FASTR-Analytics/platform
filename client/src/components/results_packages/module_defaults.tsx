import {
  getMergedModuleConfigSelections,
  type ModuleDefaultsGlobalFile,
  type ModuleParameter,
  type RunGenerationDefaults,
  type RunGenerationModuleOption,
  type RunGenerationModuleOptions,
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
import { batch, createSignal, For, Show } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import {
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
// When the fleet's global defaults are published (contract on
// ModuleDefaultsGlobalFile), a param whose value differs from its global
// value is marked, and resets per param, per module or all set it to the
// global value: unpinned when that equals the current definition default
// (so it keeps following the definition), pinned otherwise. Like the
// definition reset, these fill the form and land on save.
type Props = EditorComponentProps<Record<never, never>, undefined>;

export function ModuleDefaultsEditor(p: Props) {
  holdCopilotView();
  copilotViewController.setView("module_defaults");

  const query = createQuery(
    async () => {
      const [optionsRes, defaultsRes, globalRes] = await Promise.all([
        serverActions.getRunGenerationModuleOptions({}),
        serverActions.getRunGenerationDefaults({}),
        serverActions.getModuleDefaultsGlobal({}),
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
          // A global-defaults read failure never blocks the editor: it just
          // has no global controls.
          global: globalRes.success ? globalRes.data.global : null,
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
            global={keyed.global}
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
  global: ModuleDefaultsGlobalFile | null;
  close: (v: undefined) => void;
}) {
  const [includeHmis, setIncludeHmis] = createSignal(
    p.defaults.step1?.hmis === true,
  );
  const [includeHfa, setIncludeHfa] = createSignal(
    p.defaults.step1?.hfa === true,
  );
  const [includeIceh, setIncludeIceh] = createSignal(
    p.defaults.step1?.iceh === true,
  );

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

  // All three are read only at save time, so plain Sets: no reactivity
  // needed. A per-param key is in at most one of dirtyParams (write the form
  // value) and unpinParams (drop the stored key); adjusting a param makes it
  // dirty. Reset marks the module's stored entry for deletion; adjusting any
  // of its params afterwards resumes normal dirty-tracked saving from the
  // definition defaults the reset put in the form.
  const dirtyParams = new Set<string>();
  const unpinParams = new Set<string>();
  const resetModuleIds = new Set<string>();
  const paramKey = (moduleId: string, replacementString: string) =>
    `${moduleId}|${replacementString}`;

  function resetToDefaults(option: RunGenerationModuleOption): void {
    batch(() => {
      for (const param of option.parameters) {
        dirtyParams.delete(paramKey(option.id, param.replacementString));
        unpinParams.delete(paramKey(option.id, param.replacementString));
        setParamValues(
          option.id,
          param.replacementString,
          param.input.defaultValue,
        );
      }
    });
    resetModuleIds.add(option.id);
  }

  function globalValue(
    moduleId: string,
    replacementString: string,
  ): string | undefined {
    return p.global?.parameters[moduleId]?.[replacementString]?.value;
  }

  function paramDiffers(moduleId: string, param: ModuleParameter): boolean {
    const g = globalValue(moduleId, param.replacementString);
    return g !== undefined &&
      paramValues[moduleId][param.replacementString] !== g;
  }

  function moduleDiffers(option: RunGenerationModuleOption): boolean {
    return option.parameters.some((param) => paramDiffers(option.id, param));
  }

  const differingCount = () =>
    p.options.modules.reduce(
      (n, o) =>
        n + o.parameters.filter((param) => paramDiffers(o.id, param)).length,
      0,
    );

  function resetParamToGlobal(
    option: RunGenerationModuleOption,
    param: ModuleParameter,
  ): void {
    const g = globalValue(option.id, param.replacementString);
    if (g === undefined) {
      return;
    }
    const key = paramKey(option.id, param.replacementString);
    if (g === param.input.defaultValue) {
      dirtyParams.delete(key);
      unpinParams.add(key);
    } else {
      unpinParams.delete(key);
      dirtyParams.add(key);
    }
    setParamValues(option.id, param.replacementString, g);
  }

  function resetModuleToGlobal(option: RunGenerationModuleOption): void {
    batch(() => {
      for (const param of option.parameters) {
        resetParamToGlobal(option, param);
      }
    });
  }

  function resetAllToGlobal(): void {
    batch(() => {
      for (const option of p.options.modules) {
        resetModuleToGlobal(option);
      }
    });
  }

  const save = createFormAction(
    async () => {
      const values = unwrap(paramValues);
      function savedEntriesFor(
        o: RunGenerationModuleOption,
      ): Record<string, string> {
        const entries: Record<string, string> = resetModuleIds.has(o.id)
          ? {}
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
          step1: {
            hmis: includeHmis(),
            hfa: includeHfa(),
            iceh: includeIceh(),
          },
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

      <Show when={p.global}>
        <div class="ui-pad ui-gap flex items-center rounded border">
          <div class="text-base-content-muted flex-1 text-sm">
            {differingCount() > 0
              ? `${
                t3({
                  en:
                    "Parameters that differ from the global defaults (the value most countries use)",
                  fr:
                    "Paramètres qui diffèrent des valeurs par défaut globales (la valeur utilisée par la plupart des pays)",
                  pt:
                    "Parâmetros que diferem das predefinições globais (o valor usado pela maioria dos países)",
                })
              }: ${differingCount()}`
              : t3({
                en:
                  "Every parameter matches the global defaults (the value most countries use).",
                fr:
                  "Tous les paramètres correspondent aux valeurs par défaut globales (la valeur utilisée par la plupart des pays).",
                pt:
                  "Todos os parâmetros coincidem com as predefinições globais (o valor usado pela maioria dos países).",
              })}
          </div>
          <Show when={differingCount() > 0}>
            <Button
              size="sm"
              outline
              intent="neutral"
              iconName="refresh"
              onClick={resetAllToGlobal}
            >
              {t3({
                en: "Reset all to global defaults",
                fr: "Tout réinitialiser aux valeurs par défaut globales",
                pt: "Repor tudo nas predefinições globais",
              })}
            </Button>
          </Show>
        </div>
      </Show>

      <h3 class="ui-text-heading">
        {t3({
          en: "Default data families",
          fr: "Familles de données par défaut",
          pt: "Famílias de dados predefinidas",
        })}
      </h3>
      <div class="ui-pad ui-spy rounded border">
        <Checkbox
          label={t3({ en: "HMIS data", fr: "Données HMIS", pt: "Dados HMIS" })}
          checked={includeHmis()}
          onChange={setIncludeHmis}
        />
        <Checkbox
          label={t3({ en: "HFA data", fr: "Données FOSA", pt: "Dados HFA" })}
          checked={includeHfa()}
          onChange={setIncludeHfa}
        />
        <Checkbox
          label={t3({
            en: "ICEH equity data",
            fr: "Données d'équité ICEH",
            pt: "Dados de equidade ICEH",
          })}
          checked={includeIceh()}
          onChange={setIncludeIceh}
        />
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
                <Checkbox
                  label={option.label}
                  checked={selected[option.id] === true}
                  onChange={(v) => setSelected(option.id, v)}
                />
              </div>
              <Show when={moduleDiffers(option)}>
                <Button
                  size="sm"
                  outline
                  intent="neutral"
                  iconName="refresh"
                  onClick={() => resetModuleToGlobal(option)}
                >
                  {t3({
                    en: "Reset to global defaults",
                    fr: "Réinitialiser aux valeurs par défaut globales",
                    pt: "Repor as predefinições globais",
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
                globalDefault={p.global
                  ? {
                    valueFor: (k) => globalValue(option.id, k),
                    onReset: (k) => {
                      const param = option.parameters.find((x) =>
                        x.replacementString === k
                      );
                      if (param) {
                        resetParamToGlobal(option, param);
                      }
                    },
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
