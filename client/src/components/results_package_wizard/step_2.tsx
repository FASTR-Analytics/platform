import {
  getMergedModuleConfigSelections,
  t3,
  type DatasetType,
  type ModuleId,
  type RunGenerationModuleOption,
  type RunGenerationModuleOptions,
  type RunGenerationPrefill,
  type RunGenerationStep1Result,
  type RunGenerationStep2Result,
} from "lib";
import {
  Button,
  Checkbox,
  StateHolderFormError,
  StateHolderWrapper,
  createFormAction,
  createQuery,
} from "panther";
import { For, Show, batch } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { ModuleParameterInputs } from "~/components/_shared/module_parameter_inputs";
import { serverActions } from "~/server_actions";

type Props = {
  projectId: string;
  step1Result: RunGenerationStep1Result;
  step2Result: RunGenerationStep2Result | null;
  silentFetch: () => Promise<void>;
};

// Step 2 — configure modules: definitions resolved from the modules repo at
// latest commit (the returned gitRef is recorded into step2Result so the run
// pipeline re-fetches identical definitions). Selection is DAG-aware,
// mirroring the resolve-stage validation: checking a module auto-includes
// its dependency closure, a module cannot be unchecked while a dependent is
// checked, and a module whose closure needs data not chosen in step 1 is
// disabled. Parameter values: resume beats the attached run's manifest
// prefill beats definition defaults (getMergedModuleConfigSelections).
export function Step2(p: Props) {
  const query = createQuery(
    async () => {
      const [optionsRes, prefillRes] = await Promise.all([
        serverActions.getRunGenerationModuleOptions({
          project_id: p.projectId,
        }),
        serverActions.getRunGenerationPrefill({ project_id: p.projectId }),
      ]);
      if (optionsRes.success === false) {
        return optionsRes;
      }
      if (prefillRes.success === false) {
        return prefillRes;
      }
      return {
        success: true as const,
        data: { options: optionsRes.data, prefill: prefillRes.data },
      };
    },
    t3({
      en: "Loading module definitions...",
      fr: "Chargement des définitions de modules...",
      pt: "A carregar as definições dos módulos...",
    }),
  );

  return (
    <StateHolderWrapper state={query.state()}>
      {(keyed) => (
        <Step2Inner
          projectId={p.projectId}
          step1Result={p.step1Result}
          step2Result={p.step2Result}
          options={keyed.options}
          prefill={keyed.prefill}
          silentFetch={p.silentFetch}
        />
      )}
    </StateHolderWrapper>
  );
}

function Step2Inner(p: {
  projectId: string;
  step1Result: RunGenerationStep1Result;
  step2Result: RunGenerationStep2Result | null;
  options: RunGenerationModuleOptions;
  prefill: RunGenerationPrefill;
  silentFetch: () => Promise<void>;
}) {
  const selectedFamilies = new Set<DatasetType>([
    ...(p.step1Result.hmis !== null ? (["hmis"] as const) : []),
    ...(p.step1Result.hfa !== null ? (["hfa"] as const) : []),
    ...(p.step1Result.iceh ? (["iceh"] as const) : []),
  ]);

  const optionById = new Map(p.options.modules.map((o) => [o.id, o]));

  // Dependency closure (self + prerequisites + results-object source
  // modules, transitive). A dependency missing from the options (e.g.
  // country-filtered) leaves the closure incomplete — closureComplete marks
  // the module unofferable.
  function closureOf(id: ModuleId): { ids: Set<ModuleId>; complete: boolean } {
    const ids = new Set<ModuleId>();
    let complete = true;
    const queue: ModuleId[] = [id];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (ids.has(current)) {
        continue;
      }
      const option = optionById.get(current);
      if (option === undefined) {
        complete = false;
        continue;
      }
      ids.add(current);
      queue.push(...option.prerequisites, ...option.moduleDependencies);
    }
    return { ids, complete };
  }
  const closures = new Map(p.options.modules.map((o) => [o.id, closureOf(o.id)]));

  function missingFamiliesFor(id: ModuleId): DatasetType[] {
    const closure = closures.get(id)!;
    const missing = new Set<DatasetType>();
    for (const memberId of closure.ids) {
      for (const datasetType of optionById.get(memberId)!.datasetTypes) {
        if (!selectedFamilies.has(datasetType)) {
          missing.add(datasetType);
        }
      }
    }
    return [...missing];
  }

  function isOfferable(id: ModuleId): boolean {
    return closures.get(id)!.complete && missingFamiliesFor(id).length === 0;
  }

  // Seed: resume beats prefill; drop anything no longer offerable, then
  // closure-complete what remains.
  const seedIds =
    p.step2Result?.modules.map((m) => m.moduleId as ModuleId) ??
      p.prefill.moduleIds.map((id) => id as ModuleId);
  const initialSelected: Record<string, boolean> = {};
  for (const id of seedIds) {
    if (optionById.has(id) && isOfferable(id)) {
      for (const memberId of closures.get(id)!.ids) {
        initialSelected[memberId] = true;
      }
    }
  }
  const [selected, setSelected] = createStore<Record<string, boolean>>(
    initialSelected,
  );

  function seedSelectionsFor(id: ModuleId): Record<string, string> {
    const resumed = p.step2Result?.modules.find((m) => m.moduleId === id);
    return resumed?.parameterSelections ?? p.prefill.parameterSelections[id] ??
      {};
  }
  const [paramValues, setParamValues] = createStore<
    Record<string, Record<string, string>>
  >(
    Object.fromEntries(
      p.options.modules.map((o) => [
        o.id,
        getMergedModuleConfigSelections(
          { parameterDefinitions: [], parameterSelections: seedSelectionsFor(o.id) },
          { parameters: o.parameters },
        ).parameterSelections,
      ]),
    ),
  );

  function toggle(id: ModuleId, checked: boolean) {
    batch(() => {
      if (checked) {
        for (const memberId of closures.get(id)!.ids) {
          setSelected(memberId, true);
        }
      } else {
        setSelected(id, false);
      }
    });
  }

  function selectedDependentsOf(id: ModuleId): RunGenerationModuleOption[] {
    return p.options.modules.filter(
      (o) => o.id !== id && selected[o.id] && closures.get(o.id)!.ids.has(id),
    );
  }

  const save = createFormAction(async () => {
    const chosen = p.options.modules.filter((o) => selected[o.id]);
    if (chosen.length === 0) {
      return {
        success: false,
        err: t3({
          en: "Select at least one module for the results package",
          fr: "Sélectionnez au moins un module pour le paquet de résultats",
          pt: "Selecione pelo menos um módulo para o pacote de resultados",
        }),
      };
    }
    return await serverActions.updateRunGenerationAttemptStep2({
      project_id: p.projectId,
      step2Result: {
        gitRef: p.options.gitRef,
        modules: chosen.map((o) => ({
          moduleId: o.id,
          parameterSelections: { ...unwrap(paramValues)[o.id] },
        })),
      },
    });
  }, p.silentFetch);

  const familyLabels: Record<DatasetType, string> = {
    hmis: t3({ en: "HMIS", fr: "HMIS", pt: "HMIS" }),
    hfa: t3({ en: "HFA", fr: "FOSA", pt: "HFA" }),
    iceh: t3({ en: "ICEH", fr: "ICEH", pt: "ICEH" }),
  };

  return (
    <div class="ui-pad ui-spy">
      <h3 class="font-700 text-lg">
        {t3({
          en: "Configure modules",
          fr: "Configurer les modules",
          pt: "Configurar os módulos",
        })}
      </h3>
      <div class="text-neutral text-sm">
        {t3({
          en: "Choose which modules this results package runs. Selecting a module automatically includes the modules it depends on.",
          fr: "Choisissez les modules exécutés par ce paquet de résultats. La sélection d'un module inclut automatiquement les modules dont il dépend.",
          pt: "Escolha os módulos que este pacote de resultados executa. Selecionar um módulo inclui automaticamente os módulos de que depende.",
        })}
      </div>

      <For each={p.options.modules}>
        {(option) => {
          const offerable = isOfferable(option.id);
          const missingFamilies = missingFamiliesFor(option.id);
          return (
            <div class="border-base-300 ui-pad ui-spy-sm rounded border">
              <Checkbox
                label={option.label}
                checked={selected[option.id] === true}
                onChange={(v) => toggle(option.id, v)}
                disabled={
                  !offerable ||
                  (selected[option.id] === true &&
                    selectedDependentsOf(option.id).length > 0)
                }
              />
              <Show when={!offerable}>
                <div class="text-neutral text-sm">
                  <Show
                    when={missingFamilies.length > 0}
                    fallback={t3({
                      en: "Not available for this instance",
                      fr: "Non disponible pour cette instance",
                      pt: "Não disponível para esta instância",
                    })}
                  >
                    {t3({
                      en: "Requires data not chosen in step 1:",
                      fr: "Nécessite des données non choisies à l'étape 1 :",
                      pt: "Requer dados não escolhidos no passo 1:",
                    })}{" "}
                    {missingFamilies.map((f) => familyLabels[f]).join(", ")}
                  </Show>
                </div>
              </Show>
              <Show
                when={
                  selected[option.id] === true &&
                  selectedDependentsOf(option.id).length > 0
                }
              >
                <div class="text-neutral text-sm">
                  {t3({
                    en: "Required by:",
                    fr: "Requis par :",
                    pt: "Requerido por:",
                  })}{" "}
                  {selectedDependentsOf(option.id)
                    .map((o) => o.label)
                    .join(", ")}
                </div>
              </Show>
              <Show
                when={selected[option.id] === true && option.parameters.length > 0}
              >
                <ModuleParameterInputs
                  parameters={option.parameters}
                  values={paramValues[option.id]}
                  onChange={(k, v) => setParamValues(option.id, k, v)}
                />
              </Show>
            </div>
          );
        }}
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
            en: "Save and continue",
            fr: "Enregistrer et continuer",
            pt: "Guardar e continuar",
          })}
        </Button>
      </div>
    </div>
  );
}
