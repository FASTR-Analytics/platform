import {
  MODULE_REGISTRY,
  t3,
  type RunGenerationStep1Result,
  type RunGenerationStep2Result,
} from "lib";
import {
  Button,
  Input,
  StateHolderFormError,
  createFormAction,
} from "panther";
import { For, Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  projectId: string;
  step1Result: RunGenerationStep1Result;
  step2Result: RunGenerationStep2Result;
  onLaunched: () => Promise<void>;
};

// Step 3 — confirm: label + selection summary, then Launch. Launch consumes
// the attempt server-side (the run owns its lifecycle from here), so on
// success the wizard closes and progress shows on the project's Results
// package surface via SSE.
export function Step3(p: Props) {
  const [label, setLabel] = createSignal(
    `${t3({
      en: "Results package",
      fr: "Paquet de résultats",
      pt: "Pacote de resultados",
    })} ${new Date().toISOString().slice(0, 10)}`,
  );

  function moduleLabel(moduleId: string): string {
    const entry = MODULE_REGISTRY.find((m) => m.id === moduleId);
    return entry === undefined ? moduleId : t3(entry.label);
  }

  const launch = createFormAction(async () => {
    const trimmed = label().trim();
    if (trimmed === "") {
      return {
        success: false,
        err: t3({
          en: "Enter a label for the results package",
          fr: "Saisissez un libellé pour le paquet de résultats",
          pt: "Introduza um rótulo para o pacote de resultados",
        }),
      };
    }
    const res = await serverActions.launchRunGeneration({
      project_id: p.projectId,
      label: trimmed,
    });
    if (res.success === false) {
      return res;
    }
    return { success: true };
  }, p.onLaunched);

  return (
    <div class="ui-pad ui-spy">
      <h3 class="font-700 text-lg">
        {t3({
          en: "Confirm and launch",
          fr: "Confirmer et lancer",
          pt: "Confirmar e iniciar",
        })}
      </h3>

      <div class="max-w-lg">
        <div class="font-700 mb-1">
          {t3({ en: "Label", fr: "Libellé", pt: "Rótulo" })}
        </div>
        <Input value={label()} onChange={setLabel} fullWidth />
      </div>

      <div class="border-base-300 ui-pad rounded border">
        <h4 class="font-700 mb-2">
          {t3({ en: "Data", fr: "Données", pt: "Dados" })}
        </h4>
        <ul class="ui-spy-sm text-sm">
          <Show when={p.step1Result.hmis}>
            <li>{t3({ en: "HMIS data", fr: "Données HMIS", pt: "Dados HMIS" })}</li>
          </Show>
          <Show when={p.step1Result.hfa} keyed>
            {(hfa) => (
              <li>
                {t3({ en: "HFA data", fr: "Données FOSA", pt: "Dados HFA" })}
                {hfa.serviceCategoryScope.length > 0
                  ? ` (${hfa.serviceCategoryScope.length} ${t3({
                    en: "service categories",
                    fr: "catégories de service",
                    pt: "categorias de serviço",
                  })})`
                  : ""}
              </li>
            )}
          </Show>
          <Show when={p.step1Result.iceh}>
            <li>
              {t3({
                en: "ICEH equity data",
                fr: "Données d'équité ICEH",
                pt: "Dados de equidade ICEH",
              })}
            </li>
          </Show>
        </ul>
      </div>

      <div class="border-base-300 ui-pad rounded border">
        <h4 class="font-700 mb-2">
          {t3({ en: "Modules", fr: "Modules", pt: "Módulos" })}
        </h4>
        <ul class="ui-spy-sm text-sm">
          <For each={p.step2Result.modules}>
            {(mod) => <li>{moduleLabel(mod.moduleId)}</li>}
          </For>
        </ul>
      </div>

      <div class="text-neutral text-sm">
        {t3({
          en: "Generation runs in the background. You can leave this page and follow progress on the Results package tab.",
          fr: "La génération s'exécute en arrière-plan. Vous pouvez quitter cette page et suivre la progression dans l'onglet Paquet de résultats.",
          pt: "A geração é executada em segundo plano. Pode sair desta página e acompanhar o progresso no separador Pacote de resultados.",
        })}
      </div>

      <StateHolderFormError state={launch.state()} />

      <div class="ui-gap-sm flex">
        <Button
          onClick={launch.click}
          intent="success"
          state={launch.state()}
          iconName="check"
        >
          {t3({
            en: "Launch generation",
            fr: "Lancer la génération",
            pt: "Iniciar a geração",
          })}
        </Button>
      </div>
    </div>
  );
}
