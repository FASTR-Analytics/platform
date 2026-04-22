import { t3, TC, type ModuleId, type ModuleUpdatePreview } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Checkbox,
  StateHolderWrapper,
  timActionForm,
  timQuery,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import { serverActions } from "~/server_actions";

export function UpdateModule(
  p: AlertComponentProps<
    {
      projectId: string;
      moduleId: ModuleId;
    },
    undefined
  >,
) {
  const [preserveSettings, setPreserveSettings] = createSignal<boolean>(true);
  const [preventRerun, setPreventRerun] = createSignal<boolean>(false);

  const preview = timQuery(
    () =>
      serverActions.previewModuleUpdate({
        projectId: p.projectId,
        module_id: p.moduleId,
      }),
    t3({ en: "Loading update preview...", fr: "Chargement de l'aperçu..." }),
  );

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      return serverActions.updateModuleDefinition({
        projectId: p.projectId,
        module_id: p.moduleId,
        preserveSettings: preserveSettings(),
        preventRerun: preventRerun(),
      });
    },
    () => p.close(undefined),
  );

  return (
    <AlertFormHolder
      formId="update-module"
      header={t3({ en: "Update module", fr: "Mettre à jour le module" })}
      savingState={save.state()}
      saveFunc={save.click}
      saveButtonText={t3(TC.update)}
      cancelFunc={() => p.close(undefined)}
    >
      <StateHolderWrapper state={preview.state()} noPad>
        {(data: ModuleUpdatePreview) => {
          return (
            <Show
              when={data.impactType !== "no_change"}
              fallback={
                <div class="text-neutral text-sm">
                  {t3({
                    en: "This module is already up to date.",
                    fr: "Ce module est déjà à jour.",
                  })}
                </div>
              }
            >
              <div class="ui-spy-sm">
                <ImpactBadge impactType={data.impactType} />
                <Show when={data.commitsSince.length > 0}>
                  <div>
                    <div class="text-neutral font-500 mb-1 text-xs">
                      {t3({
                        en: "Changes since installed version:",
                        fr: "Modifications depuis la version installée :",
                      })}
                    </div>
                    <div class="border-base-300 max-h-48 overflow-y-auto rounded border">
                      <For each={data.commitsSince}>
                        {(commit) => (
                          <div class="border-base-300 flex items-start gap-2 border-b px-3 py-2 last:border-b-0">
                            <span class="text-neutral font-mono text-xs">
                              {commit.sha.slice(0, 7)}
                            </span>
                            <span class="flex-1 text-sm">{commit.message}</span>
                            <span class="text-neutral text-xs">
                              {new Date(commit.date).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
                <Checkbox
                  label={t3({
                    en: "Preserve settings",
                    fr: "Conserver les paramètres",
                  })}
                  checked={preserveSettings()}
                  onChange={setPreserveSettings}
                />
                <Show when={data.impactType === "script_change"}>
                  <Checkbox
                    label={t3({
                      en: "Prevent re-run",
                      fr: "Empêcher la ré-exécution",
                    })}
                    checked={preventRerun()}
                    onChange={setPreventRerun}
                  />
                </Show>
              </div>
            </Show>
          );
        }}
      </StateHolderWrapper>
    </AlertFormHolder>
  );
}

function ImpactBadge(p: { impactType: ModuleUpdatePreview["impactType"] }) {
  return (
    <Show when={p.impactType !== "no_change"}>
      <div
        class={`font-500 rounded px-2 py-1 text-xs ${
          p.impactType === "script_change"
            ? "bg-danger/10 text-danger"
            : "bg-success/10 text-success"
        }`}
      >
        {p.impactType === "script_change"
          ? t3({
              en: "Script change — will require re-run",
              fr: "Modification du script — une ré-exécution sera nécessaire",
            })
          : t3({
              en: "Definition only — no re-run needed",
              fr: "Définition uniquement — aucune ré-exécution nécessaire",
            })}
      </div>
    </Show>
  );
}
