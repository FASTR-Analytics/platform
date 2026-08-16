import {
  getMergedModuleConfigSelections,
  t3,
  type RunGenerationDefaults,
  type RunGenerationModuleOption,
  type RunGenerationModuleOptions,
} from "lib";
import {
  Button,
  Checkbox,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderFormError,
  StateHolderWrapper,
  createFormAction,
  createQuery,
} from "panther";
import { For, Show, batch, createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import {
  ModuleParameterInputs,
  getModuleParameterInvalidMsg,
} from "~/components/_shared/module_parameter_inputs";
import { serverActions } from "~/server_actions";

// The instance's module-defaults editor (S8 "Instance module defaults"): the
// ONE writer of the `run_generation_defaults` store, which pre-fills the
// generation wizard (resume beats these defaults beats definition defaults).
// Definitions are never stored — they are resolved live on open via the same
// read the wizard uses, and drift is absorbed by
// getMergedModuleConfigSelections on the next read. Params render for EVERY
// offerable module regardless of the default module set. The save is SPARSE
// by intent: it writes the already-stored values plus the values ADJUSTED in
// this session (dirty-tracked per field), so a param no admin ever touched
// is not stored and keeps following future definition-default changes,
// while a stored value stays pinned until explicitly changed. Per-module
// "Reset to definition defaults" is the unpin act — it drops the module's
// stored entry so every one of its params follows the definition again.
// Stored entries
// for modules not offerable here (country-filtered or removed) pass through
// verbatim on save — the store tolerates unknown moduleIds by design — as
// do stored keys a definition no longer declares.
type Props = EditorComponentProps<Record<never, never>, undefined>;

export function ModuleDefaultsEditor(p: Props) {
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
        />
      }
    >
      <StateHolderWrapper state={query.state()}>
        {(keyed) => (
          <ModuleDefaultsInner
            options={keyed.options}
            defaults={keyed.defaults}
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

  // Both are read only at save time, so plain Sets — no reactivity needed.
  // Reset marks the module's stored entry for deletion; adjusting any of its
  // params afterwards resumes normal dirty-tracked saving from the
  // definition defaults the reset put in the form.
  const dirtyParams = new Set<string>();
  const resetModuleIds = new Set<string>();

  function resetToDefaults(option: RunGenerationModuleOption): void {
    batch(() => {
      for (const param of option.parameters) {
        dirtyParams.delete(`${option.id}|${param.replacementString}`);
        setParamValues(
          option.id,
          param.replacementString,
          param.input.defaultValue,
        );
      }
    });
    resetModuleIds.add(option.id);
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
          if (dirtyParams.has(`${o.id}|${param.replacementString}`)) {
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
          err: `${t3({
            en: "Fix the invalid parameter values for",
            fr: "Corrigez les valeurs de paramètres non valides pour",
            pt: "Corrija os valores de parâmetros inválidos para",
          })}: ${invalidLabels.join(", ")}`,
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
                return Object.keys(entries).length > 0
                  ? [[o.id, entries]]
                  : [];
              }),
            ),
          },
        },
      });
    },
    async () => p.close(undefined),
  );

  return (
    <div class="ui-pad ui-spy">
      <div class="text-base-content-muted max-w-2xl">
        {t3({
          en: "These defaults pre-fill the generation wizard when a new results package is configured. They can be changed there for any individual package.",
          fr: "Ces valeurs par défaut préremplissent l'assistant de génération lors de la configuration d'un nouveau paquet de résultats. Elles peuvent y être modifiées pour chaque paquet.",
          pt: "Estas predefinições preenchem o assistente de geração quando um novo pacote de resultados é configurado. Podem ser alteradas aí para cada pacote.",
        })}
      </div>

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
          en: "Checked modules are pre-selected in the wizard. Parameter values apply whenever the module is included.",
          fr: "Les modules cochés sont présélectionnés dans l'assistant. Les valeurs des paramètres s'appliquent chaque fois que le module est inclus.",
          pt: "Os módulos marcados são pré-selecionados no assistente. Os valores dos parâmetros aplicam-se sempre que o módulo é incluído.",
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
                  dirtyParams.add(`${option.id}|${k}`);
                  setParamValues(option.id, k, v);
                }}
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
    </div>
  );
}
