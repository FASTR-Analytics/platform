import { t3, type ModuleId, type RunGenerationStep1Result } from "lib";
import { Card, Input } from "panther";
import { For, Show } from "solid-js";
import { moduleLabel } from "~/components/_shared/results_package/status";

type Props = {
  families: RunGenerationStep1Result;
  chosenModuleIds: ModuleId[];
  label: string;
  setLabel: (v: string) => void;
};

// Step 3 — confirm: label and selection summary. There are no attach targets:
// a generation PRODUCES a package, and products point at it afterwards from
// their own settings (D5). That also means a failed generation moves nothing,
// and there is nothing to pre-flight here — robustness comes from the typed
// not-in-run / unavailable render states, and from the per-figure stale badge
// once a product does reattach.
export function StepConfirm(p: Props) {
  return (
    <div class="ui-spy">
      <h3 class="ui-text-heading">
        {t3({
          en: "Confirm and launch",
          fr: "Confirmer et lancer",
          pt: "Confirmar e iniciar",
        })}
      </h3>

      <div class="max-w-lg">
        <Input
          label={t3({ en: "Label", fr: "Libellé", pt: "Rótulo" })}
          value={p.label}
          onChange={p.setLabel}
          fullWidth
        />
      </div>

      <Card header={t3({ en: "Data", fr: "Données", pt: "Dados" })}>
        <ul class="ui-spy-sm text-sm">
          <Show when={p.families.hmis}>
            <li>{t3({ en: "HMIS data", fr: "Données HMIS", pt: "Dados HMIS" })}</li>
          </Show>
          <Show when={p.families.hfa}>
            <li>{t3({ en: "HFA data", fr: "Données FOSA", pt: "Dados HFA" })}</li>
          </Show>
          <Show when={p.families.iceh}>
            <li>
              {t3({
                en: "ICEH equity data",
                fr: "Données d'équité ICEH",
                pt: "Dados de equidade ICEH",
              })}
            </li>
          </Show>
        </ul>
      </Card>

      <Card header={t3({ en: "Modules", fr: "Modules", pt: "Módulos" })}>
        <ul class="ui-spy-sm text-sm">
          <For each={p.chosenModuleIds}>
            {(moduleId) => <li>{moduleLabel(moduleId)}</li>}
          </For>
        </ul>
      </Card>


      <div class="text-base-content-muted text-sm">
        {t3({
          en: "Generation runs in the background. Progress shows on the Results packages page once launched.",
          fr: "La génération s'exécute en arrière-plan. La progression s'affiche sur la page Paquets de résultats une fois lancée.",
          pt: "A geração é executada em segundo plano. O progresso é apresentado na página Pacotes de resultados após o início.",
        })}
      </div>
    </div>
  );
}
