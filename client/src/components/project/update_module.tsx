import { t3, TC, type ModuleId, type ModuleUpdatePreview } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Checkbox,
  StateHolderWrapper,
  timActionForm,
  timQuery,
} from "panther";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { setModuleLatestCommits } from "~/state/t4_ui";

export function UpdateModule(
  p: AlertComponentProps<
    {
      projectId: string;
      moduleId: ModuleId;
    },
    undefined
  >,
) {
  const preview = timQuery(
    () =>
      serverActions.previewModuleUpdate({
        projectId: p.projectId,
        module_id: p.moduleId,
      }),
    t3({ en: "Loading update preview...", fr: "Chargement de l'aperçu..." }),
  );

  // Signals for user choices
  const [reinstall, setReinstall] = createSignal<boolean>(false);
  const [rerun, setRerun] = createSignal<boolean>(false);
  const [preserveSettings, setPreserveSettings] = createSignal<boolean>(true);

  // Set defaults based on preview when it loads (one-shot, not on every state change)
  let defaultsSet = false;
  createEffect(() => {
    const state = preview.state();
    if (state.status === "ready" && !defaultsSet) {
      defaultsSet = true;
      setReinstall(state.data.hasUpdate);
      setRerun(state.data.recommendsRerun);
    }
  });

  const canSubmit = createMemo(() => reinstall() || rerun());

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      const result = await serverActions.updateModuleDefinition({
        projectId: p.projectId,
        module_id: p.moduleId,
        reinstall: reinstall(),
        rerun: rerun(),
        preserveSettings: preserveSettings(),
      });

      // Refetch moduleLatestCommits to clear "needs update" badge
      if (result.success) {
        const commitsRes = await serverActions.checkModuleUpdates({});
        if (commitsRes.success) {
          setModuleLatestCommits(commitsRes.data);
        }
      }

      return result;
    },
    () => p.close(undefined),
  );

  return (
    <AlertFormHolder
      formId="update-module"
      header={t3({ en: "Update module", fr: "Mettre à jour le module" })}
      savingState={save.state()}
      saveFunc={canSubmit() ? save.click : undefined}
      saveButtonText={t3(TC.update)}
      cancelFunc={() => p.close(undefined)}
    >
      <StateHolderWrapper state={preview.state()} noPad>
        {(data: ModuleUpdatePreview) => (
          <div class="ui-spy-sm">
            {/* Status header */}
            <div class="mb-4">
              <Show
                when={data.hasUpdate}
                fallback={
                  <div class="bg-success/10 text-success font-500 rounded px-3 py-2 text-sm">
                    {t3({
                      en: "Module is up to date",
                      fr: "Le module est à jour",
                    })}
                    <Show when={data.currentGitRef}>
                      <span class="text-neutral ml-2 font-mono text-xs">
                        ({data.currentGitRef?.slice(0, 7)})
                      </span>
                    </Show>
                  </div>
                }
              >
                <div class="bg-warning/10 text-warning font-500 rounded px-3 py-2 text-sm">
                  {t3({ en: "Update available", fr: "Mise à jour disponible" })}
                  <span class="text-neutral ml-2 font-mono text-xs">
                    {data.currentGitRef?.slice(0, 7) ?? "?"} →{" "}
                    {data.incomingGitRef.slice(0, 7)}
                  </span>
                </div>
              </Show>
            </div>

            {/* What changed - compute affecting */}
            <Show
              when={
                data.hasUpdate &&
                (data.changes.script ||
                  data.changes.configRequirements ||
                  data.changes.resultsObjects)
              }
            >
              <div class="mb-3">
                <div class="text-danger text-xs mb-1">
                  {t3({
                    en: "May change results",
                    fr: "Peut modifier les résultats",
                  })}
                </div>
                <div class="flex flex-wrap gap-2">
                  <Show when={data.changes.script}>
                    <ChangeBadge label="Script" isComputeAffecting />
                  </Show>
                  <Show when={data.changes.configRequirements}>
                    <ChangeBadge
                      label="Config requirements"
                      isComputeAffecting
                    />
                  </Show>
                  <Show when={data.changes.resultsObjects}>
                    <ChangeBadge label="Results objects" isComputeAffecting />
                  </Show>
                </div>
              </div>
            </Show>

            {/* What changed - visualization only */}
            <Show
              when={
                data.hasUpdate &&
                (data.changes.metrics ||
                  data.changes.vizPresets ||
                  data.changes.label ||
                  data.changes.dataSources ||
                  data.changes.assetsToImport)
              }
            >
              <div class="mb-4">
                <div class="text-neutral text-xs mb-1">
                  {t3({
                    en: "Visualization changes only",
                    fr: "Modifications d'affichage uniquement",
                  })}
                </div>
                <div class="flex flex-wrap gap-2">
                  <Show when={data.changes.metrics}>
                    <ChangeBadge label="Metrics" />
                  </Show>
                  <Show when={data.changes.vizPresets}>
                    <ChangeBadge label="Viz presets" />
                  </Show>
                  <Show when={data.changes.label}>
                    <ChangeBadge label="Label" />
                  </Show>
                  <Show when={data.changes.dataSources}>
                    <ChangeBadge label="Data sources" />
                  </Show>
                  <Show when={data.changes.assetsToImport}>
                    <ChangeBadge label="Assets" />
                  </Show>
                </div>
              </div>
            </Show>

            {/* Commits since */}
            <Show when={data.commitsSince.length > 0}>
              <div class="mb-4">
                <div class="text-neutral font-500 mb-1 text-xs uppercase">
                  {t3({
                    en: "Commits since installed",
                    fr: "Commits depuis l'installation",
                  })}
                </div>
                <div class="border-base-300 max-h-32 overflow-y-auto rounded border">
                  <For each={data.commitsSince}>
                    {(commit) => (
                      <div class="border-base-300 flex items-start gap-2 border-b px-3 py-2 text-xs last:border-b-0">
                        <span class="text-neutral font-mono">
                          {commit.sha.slice(0, 7)}
                        </span>
                        <span class="flex-1">{commit.message}</span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            {/* Actions */}
            <div class="border-base-300 space-y-3 rounded border p-3">
              <Checkbox
                label={
                  <div>
                    <div>
                      {t3({
                        en: "Reinstall definition",
                        fr: "Réinstaller la définition",
                      })}
                    </div>
                    <div class="text-neutral text-xs font-normal">
                      {t3({
                        en: "Update metrics, presets, and presentation objects from latest source",
                        fr: "Mettre à jour les métriques, préréglages et objets de présentation",
                      })}
                    </div>
                  </div>
                }
                checked={reinstall()}
                onChange={setReinstall}
              />

              <Show when={reinstall()}>
                <div class="border-base-300 border-l-2 pl-6">
                  <Checkbox
                    label={
                      <div>
                        <div>
                          {t3({
                            en: "Preserve settings",
                            fr: "Conserver les paramètres",
                          })}
                        </div>
                        <div class="text-neutral text-xs font-normal">
                          {t3({
                            en: "Keep your current parameter values where possible",
                            fr: "Conserver vos valeurs de paramètres actuelles si possible",
                          })}
                        </div>
                      </div>
                    }
                    checked={preserveSettings()}
                    onChange={setPreserveSettings}
                  />
                </div>
              </Show>

              <Checkbox
                label={
                  <div>
                    <div>
                      {t3({ en: "Rerun module", fr: "Réexécuter le module" })}
                    </div>
                    <div class="text-neutral text-xs font-normal">
                      {t3({
                        en: "Execute R script and recompute all results",
                        fr: "Exécuter le script R et recalculer tous les résultats",
                      })}
                    </div>
                  </div>
                }
                checked={rerun()}
                onChange={setRerun}
              />
            </div>

            {/* Recommendation */}
            <Show when={data.recommendsRerun && !rerun()}>
              <div class="bg-warning/10 text-warning mt-3 rounded px-3 py-2 text-xs">
                {t3({
                  en: "Compute-affecting changes detected. Rerun recommended.",
                  fr: "Changements affectant le calcul détectés. Réexécution recommandée.",
                })}
              </div>
            </Show>

            <Show when={!canSubmit()}>
              <div class="text-neutral mt-3 text-xs">
                {t3({
                  en: "Select at least one action to apply.",
                  fr: "Sélectionnez au moins une action à appliquer.",
                })}
              </div>
            </Show>
          </div>
        )}
      </StateHolderWrapper>
    </AlertFormHolder>
  );
}

function ChangeBadge(p: { label: string; isComputeAffecting?: boolean }) {
  return (
    <span
      class={`rounded px-2 py-0.5 text-xs ${
        p.isComputeAffecting
          ? "bg-danger text-danger-content"
          : "bg-neutral text-base-100"
      }`}
    >
      {p.label}
      {p.isComputeAffecting && " *"}
    </span>
  );
}
