import {
  t3,
  type ModuleId,
  type ProjectSummary,
  type RunGenerationStep1Result,
} from "lib";
import { Card, Checkbox, Input } from "panther";
import { For, Show } from "solid-js";
import { moduleLabel } from "~/components/_shared/results_package/status";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  families: RunGenerationStep1Result;
  chosenModuleIds: ModuleId[];
  label: string;
  setLabel: (v: string) => void;
  attachTargets: Record<string, boolean>;
  setAttachTarget: (projectId: string, v: boolean) => void;
};

// A project can only receive a package while it is ready and unlocked; the
// launch route re-checks the same rule, since the selection predates it.
function attachIneligibleReason(project: ProjectSummary): string | undefined {
  if (project.status === "copying") {
    return t3({ en: "Being copied", fr: "Copie en cours", pt: "A ser copiado" });
  }
  if (project.status === "pending_deletion") {
    return t3({
      en: "Scheduled for deletion",
      fr: "Suppression programmée",
      pt: "Eliminação programada",
    });
  }
  if (project.isLocked) {
    return t3({
      en: "Project is locked",
      fr: "Le projet est verrouillé",
      pt: "O projeto está bloqueado",
    });
  }
  return undefined;
}

// Step 3 — confirm: label, selection summary, attach targets. Attach-at-
// launch: the selected projects are repointed inside the publish transaction
// when generation succeeds. Selection defaults to none — a package can
// equally be attached later from a project's Results package tab, and a
// failed generation leaves every project on its current package. There is
// no pre-launch compatibility report (the run does not exist yet);
// robustness comes from the typed not-in-run / unavailable render states.
export function StepConfirm(p: Props) {
  function projectCheckboxLabel(project: ProjectSummary): string {
    const reason = attachIneligibleReason(project);
    return reason === undefined ? project.label : `${project.label} — ${reason}`;
  }

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

      <Card
        header={t3({
          en: "Attach to projects",
          fr: "Rattacher aux projets",
          pt: "Anexar a projetos",
        })}
      >
        <div class="ui-spy-sm">
          <div class="text-base-content-muted text-sm">
            {t3({
              en: "These projects switch to the new package when generation succeeds. Optional — you can also attach it later from a project's Results package tab.",
              fr: "Ces projets basculeront vers le nouveau paquet lorsque la génération aura réussi. Facultatif — vous pouvez aussi le rattacher plus tard depuis l'onglet Paquet de résultats d'un projet.",
              pt: "Estes projetos passam a usar o novo pacote quando a geração for concluída com êxito. Opcional — também o pode anexar mais tarde no separador Pacote de resultados de um projeto.",
            })}
          </div>
          <Show
            when={instanceState.projects.length > 0}
            fallback={
              <div class="text-base-content-muted text-sm">
                {t3({
                  en: "No projects available",
                  fr: "Aucun projet disponible",
                  pt: "Nenhum projeto disponível",
                })}
              </div>
            }
          >
            <For each={instanceState.projects}>
              {(project) => (
                <Checkbox
                  label={projectCheckboxLabel(project)}
                  checked={p.attachTargets[project.id] === true}
                  onChange={(v) => p.setAttachTarget(project.id, v)}
                  disabled={attachIneligibleReason(project) !== undefined}
                />
              )}
            </For>
          </Show>
        </div>
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
