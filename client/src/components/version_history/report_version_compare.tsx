import { t3, type ReportVersionLineageStep, type VersionEditor } from "lib";
import {
  type AlertComponentProps,
  Button,
  createQuery,
  ModalContainer,
  StateHolderWrapper,
} from "panther";
import { For, Show, Switch, Match } from "solid-js";
import { serverActions } from "~/server_actions";
import { projectState } from "~/state/project/t1_store";
import {
  computeAttributedDiff,
  type DiffSegment,
  type VersionStep,
} from "./version_diff";

// Unified one-page comparison between a version and the current document:
// additions highlighted, removals struck through, and each changed section
// attributed on hover to the editing session that made it (computed by
// diffing the version's lineage — see version_diff.ts).
export function ReportVersionCompare(
  p: AlertComponentProps<
    {
      projectId: string;
      reportId: string;
      versionId: string;
      currentBody: string;
    },
    void
  >,
) {
  const lineage = createQuery(
    () =>
      serverActions.getReportVersionLineage({
        projectId: p.projectId,
        report_id: p.reportId,
        version_id: p.versionId,
      }),
    t3({ en: "Comparing versions...", fr: "Comparaison des versions...", pt: "A comparar versões..." }),
  );

  // Names prefer the live project-user record over the capture-time name.
  function editorNames(editors: VersionEditor[]): string {
    return editors
      .map((e) => {
        const known = projectState.projectUsers.find((u) => u.email === e.email);
        const liveName = known
          ? `${known.firstName ?? ""} ${known.lastName ?? ""}`.trim()
          : "";
        return liveName || e.name;
      })
      .join(", ");
  }

  function buildSegments(steps: ReportVersionLineageStep[]): DiffSegment[] {
    const chain: VersionStep[] = steps.map((s, i) => ({
      body: s.body,
      label: i === 0 ? "" : editorNames(s.editors),
    }));
    // Edits newer than the newest stored version (the open session).
    if (chain.length === 0 || chain[chain.length - 1].body !== p.currentBody) {
      chain.push({
        body: p.currentBody,
        label: t3({
          en: "recent edits (not yet saved as a version)",
          fr: "modifications récentes (pas encore enregistrées comme version)",
          pt: "edições recentes (ainda não guardadas como versão)",
        }),
      });
    }
    return computeAttributedDiff(chain);
  }

  function addedTitle(who?: string): string {
    return who
      ? `${t3({ en: "Added by", fr: "Ajouté par", pt: "Adicionado por" })} ${who}`
      : t3({ en: "Added since this version", fr: "Ajouté depuis cette version", pt: "Adicionado desde esta versão" });
  }

  function removedTitle(who?: string): string {
    return who
      ? `${t3({ en: "Removed by", fr: "Supprimé par", pt: "Removido por" })} ${who}`
      : t3({ en: "Removed since this version", fr: "Supprimé depuis cette version", pt: "Removido desde esta versão" });
  }

  return (
    <ModalContainer
      width="4xl"
      title={t3({
        en: "Changes since this version",
        fr: "Modifications depuis cette version",
        pt: "Alterações desde esta versão",
      })}
      rightButtons={
        <Button outline onClick={() => p.close(undefined)}>
          {t3({ en: "Close", fr: "Fermer", pt: "Fechar" })}
        </Button>
      }
    >
      <StateHolderWrapper state={lineage.state()}>
        {(steps) => {
          const segments = buildSegments(steps);
          const hasChanges = segments.some((s) => s.kind !== "same");
          return (
            <div class="ui-gap flex flex-col">
              <div class="text-neutral flex items-center gap-4 text-xs">
                <span>
                  <span class="bg-success/20 rounded-sm px-1">
                    {t3({ en: "added", fr: "ajouté", pt: "adicionado" })}
                  </span>
                </span>
                <span>
                  <span class="bg-danger/10 text-danger decoration-danger/70 rounded-sm px-1 line-through">
                    {t3({ en: "removed", fr: "supprimé", pt: "removido" })}
                  </span>
                </span>
                <span>
                  {t3({
                    en: "Hover a change to see who made it.",
                    fr: "Survolez une modification pour voir qui l'a faite.",
                    pt: "Passe o cursor sobre uma alteração para ver quem a fez.",
                  })}
                </span>
              </div>
              <Show
                when={hasChanges}
                fallback={
                  <div class="text-neutral py-8 text-center text-sm">
                    {t3({
                      en: "This version is identical to the current document.",
                      fr: "Cette version est identique au document actuel.",
                      pt: "Esta versão é idêntica ao documento atual.",
                    })}
                  </div>
                }
              >
                <div class="border-base-300 max-h-[65vh] overflow-auto rounded border p-4">
                  <div class="font-mono text-xs leading-5 whitespace-pre-wrap">
                    <For each={segments}>
                      {(seg) => (
                        <Switch>
                          <Match when={seg.kind === "same"}>
                            <span>{seg.text}</span>
                          </Match>
                          <Match when={seg.kind === "added"}>
                            <span
                              class="bg-success/20 cursor-help rounded-sm"
                              title={addedTitle(seg.who)}
                            >
                              {seg.text}
                            </span>
                          </Match>
                          <Match when={seg.kind === "removed"}>
                            <span
                              class="bg-danger/10 text-danger decoration-danger/70 cursor-help rounded-sm line-through"
                              title={removedTitle(seg.who)}
                            >
                              {seg.text}
                            </span>
                          </Match>
                        </Switch>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>
          );
        }}
      </StateHolderWrapper>
    </ModalContainer>
  );
}
