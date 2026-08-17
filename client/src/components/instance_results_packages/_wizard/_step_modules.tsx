import {
  t3,
  type DatasetType,
  type ModuleId,
  type RunGenerationModuleOption,
  type RunGenerationModuleOptions,
  type RunGenerationStep1Result,
} from "lib";
import { Checkbox } from "panther";
import { For, Show, createMemo } from "solid-js";
import { ModuleParameterInputs } from "~/components/_shared/module_parameter_inputs";
import {
  familiesOf,
  isOfferable,
  missingFamiliesFor,
  type ModuleGraph,
} from "./_module_graph";

type Props = {
  options: RunGenerationModuleOptions;
  graph: ModuleGraph;
  families: RunGenerationStep1Result;
  chosenIds: Set<ModuleId>;
  paramValues: Record<string, Record<string, string>>;
  setSelected: (id: ModuleId, checked: boolean) => void;
  setParam: (id: ModuleId, key: string, value: string) => void;
};

// Step 2 — configure modules. Selection is DAG-aware, mirroring the
// resolve-stage validation: a checked module shows its whole dependency
// closure checked (chosenIds is the closure-completed, offerability-masked
// set the wizard derives), a module cannot be unchecked while a dependent is
// checked, and a module whose closure needs data not chosen in step 1 is
// disabled — with the note naming the missing family, since the user can go
// back to step 1 and add it.
export function StepModules(p: Props) {
  const familySet = createMemo(() => familiesOf(p.families));

  const offerable = (id: ModuleId) => isOfferable(p.graph, id, familySet());
  const isChecked = (id: ModuleId) => p.chosenIds.has(id);

  function checkedDependentsOf(id: ModuleId): RunGenerationModuleOption[] {
    return p.options.modules.filter(
      (o) =>
        o.id !== id && isChecked(o.id) && p.graph.closures.get(o.id)!.ids.has(id),
    );
  }

  const familyLabels: Record<DatasetType, string> = {
    hmis: t3({ en: "HMIS", fr: "HMIS", pt: "HMIS" }),
    hfa: t3({ en: "HFA", fr: "FOSA", pt: "HFA" }),
    iceh: t3({ en: "ICEH", fr: "ICEH", pt: "ICEH" }),
  };

  return (
    <div class="ui-spy">
      <h3 class="ui-text-heading">
        {t3({
          en: "Configure modules",
          fr: "Configurer les modules",
          pt: "Configurar os módulos",
        })}
      </h3>
      <div class="text-base-content-muted text-sm">
        {t3({
          en: "Choose which modules this results package runs. Selecting a module automatically includes the modules it depends on.",
          fr: "Choisissez les modules exécutés par ce paquet de résultats. La sélection d'un module inclut automatiquement les modules dont il dépend.",
          pt: "Escolha os módulos que este pacote de resultados executa. Selecionar um módulo inclui automaticamente os módulos de que depende.",
        })}
      </div>

      <For each={p.options.modules}>
        {(option) => {
          const missingFamilies = () =>
            missingFamiliesFor(p.graph, option.id, familySet());
          const dependents = () => checkedDependentsOf(option.id);
          return (
            <div class="ui-pad ui-spy-sm rounded border">
              <Checkbox
                label={option.label}
                checked={isChecked(option.id)}
                onChange={(v) => p.setSelected(option.id, v)}
                disabled={
                  !offerable(option.id) ||
                  (isChecked(option.id) && dependents().length > 0)
                }
              />
              <Show when={!offerable(option.id)}>
                <div class="text-base-content-muted text-sm">
                  <Show
                    when={missingFamilies().length > 0}
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
                    {missingFamilies().map((f) => familyLabels[f]).join(", ")}
                  </Show>
                </div>
              </Show>
              <Show when={isChecked(option.id) && dependents().length > 0}>
                <div class="text-base-content-muted text-sm">
                  {t3({
                    en: "Required by:",
                    fr: "Requis par :",
                    pt: "Requerido por:",
                  })}{" "}
                  {dependents().map((o) => o.label).join(", ")}
                </div>
              </Show>
              <Show
                when={isChecked(option.id) && option.parameters.length > 0}
              >
                <ModuleParameterInputs
                  parameters={option.parameters}
                  values={p.paramValues[option.id]}
                  onChange={(k, v) => p.setParam(option.id, k, v)}
                />
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}
