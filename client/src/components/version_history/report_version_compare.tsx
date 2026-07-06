import { t3, type ReportVersionLineageStep } from "lib";
import {
  type AlertComponentProps,
  Button,
  createQuery,
  ModalContainer,
  StateHolderWrapper,
} from "panther";
import { Show } from "solid-js";
import { serverActions } from "~/server_actions";
import {
  buildAuthorNames,
  DiffLegend,
  DiffSegments,
  editorDisplayNames,
} from "./diff_segments";
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

  function buildSegments(steps: ReportVersionLineageStep[]): DiffSegment[] {
    const chain: VersionStep[] = steps.map((s, i) => ({
      body: s.body,
      label: i === 0 ? "" : editorDisplayNames(s.editors),
      labelExact: s.editors.length === 1,
      authors: s.bodyAuthors,
      names: buildAuthorNames(s.editors, s.bodyAuthors),
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
              <DiffLegend />
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
                  <DiffSegments segments={segments} />
                </div>
              </Show>
            </div>
          );
        }}
      </StateHolderWrapper>
    </ModalContainer>
  );
}
