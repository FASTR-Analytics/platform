import {
  type PresenceEntry,
  presenceColorForKey,
  t3,
  type VersionEditor,
} from "lib";
import {
  Button,
  createQuery,
  type EditorComponentProps,
  FrameLeft,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { projectState } from "~/state/project/t1_store";
import { PresenceAvatars } from "../slide_deck/presence_avatars";
import { DeckVersionPreview } from "./deck_version_preview";
import { ReportVersionPreview } from "./report_version_preview";

export type VersionHistoryKind = "report" | "deck";

// Unified list-row shape: report and deck summaries share everything the list
// renders; deck rows additionally carry slideCount.
type VersionRow = {
  id: string;
  createdAt: string;
  editors: VersionEditor[];
  sizeBytes: number;
  restoredFromVersionId: string | null;
  slideCount?: number;
};

type DayGroup = { day: string; rows: VersionRow[] };

type Props = EditorComponentProps<
  {
    projectId: string;
    kind: VersionHistoryKind;
    docId: string;
    currentLabel: string;
    /** Report only: live body accessor for "Compare with current". */
    getCurrentBody?: () => string;
  },
  undefined
>;

// Google-Docs-style version history panel: versions (one per editing session,
// captured server-side) grouped by day on the left, a read-only preview of the
// selected version on the right, with restore / restore-as-copy for users who
// can configure the document.
export function VersionHistoryEditor(p: Props) {
  const versions = createQuery<VersionRow[]>(
    async () => {
      if (p.kind === "report") {
        return await serverActions.listReportVersions({
          projectId: p.projectId,
          report_id: p.docId,
        });
      }
      return await serverActions.listDeckVersions({
        projectId: p.projectId,
        deck_id: p.docId,
      });
    },
    t3({ en: "Loading version history...", fr: "Chargement de l'historique des versions...", pt: "A carregar o histórico de versões..." }),
  );

  // undefined = the pinned "Current version" row.
  const [selectedVersionId, setSelectedVersionId] = createSignal<
    string | undefined
  >(undefined);

  const canRestore = () =>
    !projectState.isLocked &&
    (p.kind === "report"
      ? projectState.thisUserPermissions.can_configure_reports
      : projectState.thisUserPermissions.can_configure_slide_decks);

  // Contributor chips: deterministic color from the email (same recipe as live
  // presence); names prefer the live project-user record over the name stored
  // at capture time (people get renamed; emails don't).
  function chipsFor(editors: VersionEditor[]): PresenceEntry[] {
    return editors.map((e) => {
      const known = projectState.projectUsers.find((u) => u.email === e.email);
      const liveName = known
        ? `${known.firstName ?? ""} ${known.lastName ?? ""}`.trim()
        : "";
      return {
        connectionId: e.email,
        email: e.email,
        name: liveName || e.name,
        color: presenceColorForKey(e.email),
      };
    });
  }

  function groupByDay(rows: VersionRow[]): DayGroup[] {
    const groups: DayGroup[] = [];
    for (const row of rows) {
      const day = new Date(row.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const last = groups[groups.length - 1];
      if (last && last.day === day) {
        last.rows.push(row);
      } else {
        groups.push({ day, rows: [row] });
      }
    }
    return groups;
  }

  const rowClass = (selected: boolean) =>
    `w-full cursor-pointer px-3 py-2 text-left ${
      selected ? "bg-base-300" : "hover:bg-base-200"
    }`;

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={`${t3({ en: "Version history", fr: "Historique des versions", pt: "Histórico de versões" })} — ${p.currentLabel}`}
          class="border-base-300"
          leftChildren={
            <Button iconName="chevronLeft" onClick={() => p.close(undefined)} />
          }
        >
          <div class="ui-gap-sm flex items-center">
            <Button iconName="refresh" outline onClick={versions.fetch} />
          </div>
        </HeadingBar>
      }
    >
      <FrameLeft
        panelChildren={
          <div class="border-base-300 flex h-full w-80 flex-col overflow-y-auto border-r">
            <button
              type="button"
              class={`${rowClass(selectedVersionId() === undefined)} border-base-300 border-b`}
              onClick={() => setSelectedVersionId(undefined)}
            >
              <div class="font-600 text-sm">
                {t3({ en: "Current version", fr: "Version actuelle", pt: "Versão atual" })}
              </div>
            </button>
            <StateHolderWrapper state={versions.state()}>
              {(rows) => (
                <Show
                  when={rows.length > 0}
                  fallback={
                    <div class="text-neutral px-3 py-8 text-center text-xs">
                      {t3({
                        en: "No versions yet — versions are saved automatically as people edit.",
                        fr: "Aucune version pour l'instant — les versions sont enregistrées automatiquement au fil des modifications.",
                        pt: "Ainda não há versões — as versões são guardadas automaticamente à medida que as pessoas editam.",
                      })}
                    </div>
                  }
                >
                  <For each={groupByDay(rows)}>
                    {(group) => (
                      <>
                        <div class="bg-base-200 text-neutral sticky top-0 px-3 py-1 text-xs font-semibold">
                          {group.day}
                        </div>
                        <For each={group.rows}>
                          {(row) => (
                            <button
                              type="button"
                              class={rowClass(selectedVersionId() === row.id)}
                              onClick={() => setSelectedVersionId(row.id)}
                            >
                              <div class="flex items-center gap-2">
                                <span class="text-sm">
                                  {new Date(row.createdAt).toLocaleTimeString(
                                    undefined,
                                    { hour: "2-digit", minute: "2-digit" },
                                  )}
                                </span>
                                <Show when={row.restoredFromVersionId}>
                                  <span class="bg-base-300 rounded px-1.5 py-0.5 text-[10px]">
                                    {t3({ en: "Restored", fr: "Restaurée", pt: "Restaurada" })}
                                  </span>
                                </Show>
                                <span class="flex-1" />
                                <Show when={row.slideCount !== undefined}>
                                  <span class="text-neutral text-xs">
                                    {row.slideCount}{" "}
                                    {t3({ en: "slides", fr: "diapositives", pt: "diapositivos" })}
                                  </span>
                                </Show>
                              </div>
                              <div class="mt-1">
                                <PresenceAvatars
                                  peers={chipsFor(row.editors)}
                                  size="sm"
                                  max={6}
                                />
                              </div>
                            </button>
                          )}
                        </For>
                      </>
                    )}
                  </For>
                </Show>
              )}
            </StateHolderWrapper>
          </div>
        }
      >
        <Show
          when={selectedVersionId()}
          keyed
          fallback={
            <div class="text-neutral flex h-full w-full items-center justify-center px-8 text-center text-sm">
              {t3({
                en: "This is the current version. Select a version on the left to preview or restore it.",
                fr: "Ceci est la version actuelle. Sélectionnez une version à gauche pour la prévisualiser ou la restaurer.",
                pt: "Esta é a versão atual. Selecione uma versão à esquerda para a pré-visualizar ou restaurar.",
              })}
            </div>
          }
        >
          {(versionId) => (
            <Show
              when={p.kind === "report"}
              fallback={
                <DeckVersionPreview
                  projectId={p.projectId}
                  deckId={p.docId}
                  versionId={versionId}
                  canRestore={canRestore()}
                  onRestored={() => p.close(undefined)}
                />
              }
            >
              <ReportVersionPreview
                projectId={p.projectId}
                reportId={p.docId}
                versionId={versionId}
                canRestore={canRestore()}
                getCurrentBody={p.getCurrentBody}
                onRestored={() => p.close(undefined)}
              />
            </Show>
          )}
        </Show>
      </FrameLeft>
    </FrameTop>
  );
}
