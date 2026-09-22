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
  invalidDefaultLabels: string[];
  setSelected: (id: ModuleId, checked: boolean) => void;
};

// Step 2: configure modules. Selection is DAG-aware, mirroring the
// resolve-stage validation: a checked module shows its whole dependency
// closure checked (chosenIds is the closure-completed, offerability-masked
// set the wizard derives), a module cannot be unchecked while a dependent is
// checked, and a module whose closure needs data not chosen in step 1 is
// disabled: with the note naming the missing family, since the user can go
// back to step 1 and add it.
//
// Parameter values are not editable here: the instance's module defaults
// are the one place they are set, and launch sends them as stored. A chosen
// module whose stored default fails the shared validity check is named so
// the user knows to fix it in the module-defaults editor.
export function StepModules(p: Props) {
  const familySet = createMemo(() => familiesOf(p.families));

  const offerable = (id: ModuleId) => isOfferable(p.graph, id, familySet());
  const isChecked = (id: ModuleId) => p.chosenIds.has(id);

  function checkedDependentsOf(id: ModuleId): RunGenerationModuleOption[] {
    return p.options.modules.filter(
      (o) =>
        o.id !== id &&
        isChecked(o.id) &&
        p.graph.closures.get(o.id)!.ids.has(id),
    );
  }

  const familyLabels: Record<DatasetType, string> = {
    hmis: t3({ en: "HMIS", fr: "HMIS", pt: "HMIS" }),
    hfa: t3({ en: "HFA", fr: "FOSA", pt: "HFA" }),
    iceh: t3({ en: "ICEH", fr: "ICEH", pt: "ICEH" }),
  };

  return (
    <div class="ui-spy">
      <div class="ui-spy-sm">
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
      </div>

      <div class="ui-spy-sm">
        <For each={p.options.modules}>
          {(option) => {
            const missingFamilies = () =>
              missingFamiliesFor(p.graph, option.id, familySet());
            const dependents = () => checkedDependentsOf(option.id);
            return (
              <Checkbox
                label={
                  <span class="ui-gap-sm flex items-center">
                    <span>{option.label}</span>
                    <Show when={!offerable(option.id)}>
                      <span class="text-base-content-muted text-sm">
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
                          {missingFamilies()
                            .map((f) => familyLabels[f])
                            .join(", ")}
                        </Show>
                      </span>
                    </Show>
                    <Show
                      when={isChecked(option.id) && dependents().length > 0}
                    >
                      <span class="text-base-content-muted text-sm">
                        {t3({
                          en: "Required by:",
                          fr: "Requis par :",
                          pt: "Requerido por:",
                        })}{" "}
                        {dependents()
                          .map((o) => o.label)
                          .join(", ")}
                      </span>
                    </Show>
                  </span>
                }
                checked={isChecked(option.id)}
                onChange={(v) => p.setSelected(option.id, v)}
                disabled={
                  !offerable(option.id) ||
                  (isChecked(option.id) && dependents().length > 0)
                }
              />
            );
          }}
        </For>
      </div>

      <Show when={p.invalidDefaultLabels.length > 0}>
        <div class="text-danger text-sm">
          {t3({
            en: "These modules have invalid default parameter values. Fix them in Module defaults before launching:",
            fr: "Ces modules ont des valeurs de paramètres par défaut non valides. Corrigez-les dans les paramètres par défaut des modules avant de lancer :",
            pt: "Estes módulos têm valores de parâmetros predefinidos inválidos. Corrija-os nas predefinições dos módulos antes de iniciar:",
          })}{" "}
          {p.invalidDefaultLabels.join(", ")}
        </div>
      </Show>
    </div>
  );
}
