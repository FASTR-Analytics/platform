import {
  getMergedModuleConfigSelections,
  getModuleFamilyLabel,
  MODULE_FAMILY_ORDER,
  type ModuleParameter,
  type RunGenerationDefaults,
  type RunGenerationModuleOption,
  type RunGenerationModuleOptions,
  t3,
} from "lib";
import {
  Button,
  createFormAction,
  createQuery,
  EditorComponentProps,
  FrameLeftResizable,
  FrameTop,
  HeadingBar,
  type ListEntry,
  LoadingIndicator,
  SelectList,
  StateHolderFormError,
  StateHolderWrapper,
} from "panther";
import { batch, createMemo, createSignal, type JSX, Show } from "solid-js";
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
// ONE writer of the `run_generation_defaults` store, whose parameter values
// the generation wizard launches with (these defaults beat definition
// defaults). The wizard does not edit parameter values, so this editor is
// the ONLY place they are set. The store's `step1` and `moduleIds` no longer
// seed anything (the wizard turns on every family and module it can), so
// the editor shows neither and saves them back as stored.
// Definitions are never stored: they are resolved live on open via the same
// read the wizard uses, and drift is absorbed by
// getMergedModuleConfigSelections on the next read. Params render for EVERY
// offerable module. The save is SPARSE
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
// The definition default (the module's own defaultValue) is the one shared
// default for a param. A param whose value differs from it is marked, and the
// per-param reset unpins it so it follows the definition again; "Reset all to
// definition defaults" is the per-module reset across every module. Like the
// per-module reset, these fill the form and land on save.
type Props = EditorComponentProps<Record<never, never>, undefined>;

export function ModuleDefaultsEditor(p: Props) {
  holdCopilotView();
  copilotViewController.setView("module_defaults");

  const query = createQuery(
    async () => {
      const [optionsRes, defaultsRes] = await Promise.all([
        serverActions.getRunGenerationModuleOptions({}),
        serverActions.getRunGenerationDefaults({}),
      ]);
      if (optionsRes.success === false) {
        return optionsRes;
      }
      if (defaultsRes.success === false) {
        return defaultsRes;
      }
      return {
        success: true as const,
        data: { options: optionsRes.data, defaults: defaultsRes.data },
      };
    },
    t3({
      en: "Loading module definitions...",
      fr: "Chargement des définitions de modules...",
      pt: "A carregar as definições dos módulos...",
    }),
  );

  return (
    <StateHolderWrapper
      state={query.state()}
      loadingRenderer={(msg) => (
        <ModuleDefaultsFrame close={p.close}>
          <LoadingIndicator msg={msg} />
        </ModuleDefaultsFrame>
      )}
      errorRenderer={(err) => (
        <ModuleDefaultsFrame close={p.close}>
          <div class="ui-pad text-danger">{err}</div>
        </ModuleDefaultsFrame>
      )}
    >
      {(keyed) => (
        <ModuleDefaultsInner
          options={keyed.options}
          defaults={keyed.defaults}
          close={p.close}
        />
      )}
    </StateHolderWrapper>
  );
}

// The page shell: the heading bar, with the editor's page-wide actions on its
// right once the definitions have loaded.
function ModuleDefaultsFrame(p: {
  close: (v: undefined) => void;
  actions?: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          tonal
          onBack={() => p.close(undefined)}
          heading={t3({
            en: "Module defaults",
            fr: "Paramètres par défaut des modules",
            pt: "Predefinições dos módulos",
          })}
        >
          {p.actions}
        </HeadingBar>
      }
    >
      {p.children}
    </FrameTop>
  );
}

function ModuleDefaultsInner(p: {
  options: RunGenerationModuleOptions;
  defaults: RunGenerationDefaults;
  close: (v: undefined) => void;
}) {
  const offeredIds = new Set<string>(p.options.modules.map((o) => o.id));

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

  function paramDiffers(moduleId: string, param: ModuleParameter): boolean {
    return paramValues[moduleId][param.replacementString] !==
      param.input.defaultValue;
  }

  const differingIn = (o: RunGenerationModuleOption) =>
    o.parameters.filter((param) => paramDiffers(o.id, param)).length;
  const differingCount = () =>
    p.options.modules.reduce((n, o) => n + differingIn(o), 0);

  function resetParamToDefault(
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
    dirtyParams.delete(key);
    unpinParams.add(key);
    setParamValues(option.id, replacementString, param.input.defaultValue);
  }

  function resetAllToDefaults(): void {
    batch(() => {
      for (const option of p.options.modules) {
        resetToDefaults(option);
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

      const passThroughParams = Object.fromEntries(
        Object.entries(p.defaults.parameterSelections).filter(
          ([id]) => !offeredIds.has(id),
        ),
      );
      return await serverActions.saveRunGenerationDefaults({
        defaults: {
          step1: p.defaults.step1,
          moduleIds: p.defaults.moduleIds,
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

  // The picker lists only modules that take parameters, one header per
  // family in family order; the options arrive in module order
  // (compareModules), so filtering keeps the primary module first.
  const editable = p.options.modules.filter((o) => o.parameters.length > 0);
  const [selectedId, setSelectedId] = createSignal<string | undefined>(
    editable.at(0)?.id,
  );
  const selected = () => editable.find((o) => o.id === selectedId());

  const hasInvalid = (o: RunGenerationModuleOption) =>
    o.parameters.some((param) =>
      getModuleParameterInvalidMsg(
        param,
        paramValues[o.id][param.replacementString],
      ) !== undefined
    );

  const items = createMemo((): ListEntry<string>[] =>
    MODULE_FAMILY_ORDER.flatMap((family) => {
      const options = editable.filter((o) => o.family === family);
      return options.length === 0 ? [] : [
        { header: getModuleFamilyLabel(family) },
        ...options.map((o) => ({ id: o.id, label: o.label })),
      ];
    })
  );

  return (
    <ModuleDefaultsFrame
      close={p.close}
      actions={
        <div class="ui-gap-sm flex items-center">
          <Show when={differingCount() > 0}>
            <Button
              outline
              intent="neutral"
              iconName="refresh"
              onClick={resetAllToDefaults}
            >
              {t3({
                en: "Reset all to definition defaults",
                fr:
                  "Tout réinitialiser aux valeurs par défaut de la définition",
                pt: "Repor tudo nas predefinições da definição",
              })}
            </Button>
          </Show>
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
      }
    >
      <FrameLeftResizable
        startingWidth={300}
        minWidth={150}
        maxWidth={400}
        panelPad="md"
        pad="md"
        spy="md"
        panelChildren={
          <SelectList
            items={items()}
            value={selectedId()}
            onChange={setSelectedId}
            fullWidth
            emptyMessage={t3({
              en: "No module takes parameters",
              fr: "Aucun module ne prend de paramètres",
              pt: "Nenhum módulo tem parâmetros",
            })}
            renderItem={(item) => {
              const option = editable.find((o) => o.id === item.id)!;
              return (
                <div class="ui-gap-sm flex items-center justify-between">
                  <span class="truncate">{item.label}</span>
                  <Show
                    when={!hasInvalid(option)}
                    fallback={
                      <span class="text-danger shrink-0 text-xs">
                        {t3({
                          en: "Invalid",
                          fr: "Non valide",
                          pt: "Inválido",
                        })}
                      </span>
                    }
                  >
                    <Show when={differingIn(option) > 0}>
                      <span class="ui-text-caption shrink-0">
                        {differingIn(option)} {t3({
                          en: "changed",
                          fr: "modifié(s)",
                          pt: "alterado(s)",
                        })}
                      </span>
                    </Show>
                  </Show>
                </div>
              );
            }}
          />
        }
      >
        <div class="text-base-content-muted max-w-2xl text-sm">
          {t3({
            en:
              "Parameter values are set only here and apply to every results package that includes the module. The generation wizard turns on every module the data supports.",
            fr:
              "Les valeurs des paramètres se règlent uniquement ici et s'appliquent à chaque paquet de résultats qui inclut le module. L'assistant de génération active tous les modules que les données permettent.",
            pt:
              "Os valores dos parâmetros definem-se apenas aqui e aplicam-se a todos os pacotes de resultados que incluam o módulo. O assistente de geração ativa todos os módulos que os dados permitem.",
          })}
        </div>

        <StateHolderFormError state={save.state()} />

        <Show when={selected()} keyed>
          {(option) => (
            <div class="ui-spy">
              <div class="ui-gap flex items-center">
                <h3 class="ui-text-heading flex-1">{option.label}</h3>
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
              </div>
              <ModuleParameterInputs
                parameters={option.parameters}
                values={paramValues[option.id]}
                onChange={(k, v) => {
                  unpinParams.delete(paramKey(option.id, k));
                  dirtyParams.add(paramKey(option.id, k));
                  setParamValues(option.id, k, v);
                }}
                onResetToDefault={(k) => resetParamToDefault(option, k)}
              />
            </div>
          )}
        </Show>
      </FrameLeftResizable>
    </ModuleDefaultsFrame>
  );
}
