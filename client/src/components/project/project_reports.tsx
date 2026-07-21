import { ReportGroupingMode, ReportPreview, ReportSummary, t3, TC } from "lib";
import {
  Button,
  createSelectionController,
  FrameLeftResizable,
  FrameTop,
  HeadingBar,
  OpenEditorProps,
  Select,
  SelectionCircle,
  SelectList,
  getColor,
  openComponent,
  showMenu,
  createDeleteAction,
  type ListItem,
  type MenuItem,
} from "panther";
import { For, Show, createEffect, createSignal } from "solid-js";
import { AddReportForm } from "./add_report";
import { EditReportFolderModal } from "./edit_report_folder_modal";
import { MoveReportToFolderModal } from "./move_report_to_folder_modal";
import { DuplicateReportModal } from "./duplicate_report_modal";
import { ProjectReport } from "../report";
import { PresenceAvatars } from "../slide_deck/presence_avatars";
import { otherPeers } from "~/state/project/collab";
import { projectState } from "~/state/project/t1_store";
import { useAIProjectContext } from "~/components/project_ai/context";
import {
  reportGroupingMode,
  setReportGroupingMode,
  reportSelectedGroup,
  setReportSelectedGroup,
  reportSortMode,
  setReportSortMode,
} from "~/state/t4_ui";
import { SortControl, sortBySortMode } from "~/components/_shared/sort_control";
import { serverActions } from "~/server_actions";

function previewCounts(preview: ReportPreview): string {
  const parts: string[] = [];
  if (preview.figureCount > 0) {
    parts.push(
      t3({
        en: `${preview.figureCount} ${preview.figureCount === 1 ? "figure" : "figures"}`,
        fr: `${preview.figureCount} figure${preview.figureCount === 1 ? "" : "s"}`,
        pt: `${preview.figureCount} figura${preview.figureCount === 1 ? "" : "s"}`,
      }),
    );
  }
  if (preview.imageCount > 0) {
    parts.push(
      t3({
        en: `${preview.imageCount} ${preview.imageCount === 1 ? "image" : "images"}`,
        fr: `${preview.imageCount} image${preview.imageCount === 1 ? "" : "s"}`,
        pt: `${preview.imageCount} imagem${preview.imageCount === 1 ? "" : "ns"}`,
      }),
    );
  }
  return parts.join(" · ");
}

function getGroupingOptions(): { value: ReportGroupingMode; label: string }[] {
  return [
    {
      value: "folders",
      label: t3({ en: "By folder", fr: "Par dossier", pt: "Por pasta" }),
    },
    {
      value: "flat",
      label: t3({ en: "Flat list", fr: "Liste simple", pt: "Lista simples" }),
    },
  ];
}

type GroupOption = {
  value: string;
  label: string;
  count: number;
  color?: string | null;
};

type ExtendedProps = {
  openProjectEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
};

export function ProjectReports(p: ExtendedProps) {
  const { aiContext } = useAIProjectContext();

  async function openReport(reportId: string, reportLabel: string) {
    await p.openProjectEditor({
      element: ProjectReport,
      props: {
        reportId,
        reportLabel,
        projectState: projectState,
        returnToContext: aiContext(),
      },
    });
  }

  const [searchText, setSearchText] = createSignal<string>("");

  const filteredBySearch = () => {
    const reports = projectState.reports;
    if (searchText().length < 3) return reports;
    const searchLower = searchText().toLowerCase();
    return reports.filter((r) => r.label.toLowerCase().includes(searchLower));
  };

  const groupOptions = (): GroupOption[] => {
    const reports = filteredBySearch();
    const mode = reportGroupingMode();

    switch (mode) {
      case "folders": {
        const generalCount = reports.filter((r) => r.folderId === null).length;
        const groups: GroupOption[] = [
          { value: "_unfiled", label: t3(TC.general), count: generalCount },
        ];
        groups.push(
          ...projectState.reportFolders.map((f) => ({
            value: f.id,
            label: f.label,
            count: reports.filter((r) => r.folderId === f.id).length,
            color: f.color,
          })),
        );
        return groups;
      }
      case "flat":
        return [
          {
            value: "_all",
            label: t3({
              en: "All reports",
              fr: "Tous les rapports",
              pt: "Todos os relatórios",
            }),
            count: reports.length,
          },
        ];
      default:
        return [];
    }
  };

  const filteredReports = () => {
    const reports = filteredBySearch();
    const group = reportSelectedGroup();
    const mode = reportGroupingMode();

    if (!group) return [];

    let selected: ReportSummary[];
    switch (mode) {
      case "folders":
        if (group === "_unfiled") {
          selected = reports.filter((r) => r.folderId === null);
        } else {
          selected = reports.filter((r) => r.folderId === group);
        }
        break;
      default:
        selected = reports;
    }

    return sortBySortMode(
      selected,
      reportSortMode(),
      (r) => r.label,
      (r) => r.lastUpdated,
    );
  };

  createEffect(() => {
    reportGroupingMode();
    const groups = groupOptions();
    const current = reportSelectedGroup();
    if (groups.length > 0 && !groups.find((g) => g.value === current)) {
      setReportSelectedGroup(groups[0].value);
    }
  });

  const selection = createSelectionController<string>({
    ids: () => filteredReports().map((r) => r.id),
    mode: "multi",
  });

  async function handleMoveToFolder(report: ReportSummary) {
    const idsToMove = selection.getBatchIds(report.id);

    await openComponent({
      element: MoveReportToFolderModal,
      props: {
        projectId: projectState.id,
        reportIds: idsToMove,
        currentFolderId: report.folderId,
        folders: projectState.reportFolders,
      },
    });

    selection.clear();
  }

  async function handleDuplicate(report: ReportSummary) {
    const idsToDuplicate = selection.getBatchIds(report.id);

    const reportDetails = idsToDuplicate
      .map((id) => projectState.reports.find((r) => r.id === id))
      .filter((r): r is ReportSummary => r !== undefined)
      .map((r) => ({ id: r.id, label: r.label, folderId: r.folderId }));

    await openComponent({
      element: DuplicateReportModal,
      props: {
        projectId: projectState.id,
        reportDetails,
        folders: projectState.reportFolders,
      },
    });

    selection.clear();
  }

  async function handleDelete(report: ReportSummary) {
    const idsToDelete = selection.getBatchIds(report.id);

    const confirmText =
      idsToDelete.length > 1
        ? t3({
            en: `Are you sure you want to delete ${idsToDelete.length} reports?`,
            fr: `Êtes-vous sûr de vouloir supprimer ${idsToDelete.length} rapports ?`,
            pt: `Tem a certeza de que pretende eliminar ${idsToDelete.length} relatórios?`,
          })
        : t3({
            en: "Are you sure you want to delete this report?",
            fr: "Êtes-vous sûr de vouloir supprimer ce rapport ?",
            pt: "Tem a certeza de que pretende eliminar este relatório?",
          });

    const deleteAction = createDeleteAction(
      confirmText,
      async () => {
        const promises = idsToDelete.map((id) =>
          serverActions.deleteReport({
            projectId: projectState.id,
            report_id: id,
          }),
        );
        const results = await Promise.all(promises);
        const failed = results.filter((r) => !r.success);
        if (failed.length > 0) {
          return failed[0];
        }
        return results[0];
      },
      () => {
        selection.clear();
      },
    );
    await deleteAction.click();
  }

  function handleContextMenu(e: MouseEvent, report: ReportSummary) {
    e.preventDefault();

    const isMultiSelect =
      selection.isSelected(report.id) && selection.selectedCount() > 1;
    const count = selection.selectedCount();

    const items: MenuItem[] = [
      {
        label: isMultiSelect
          ? t3({
              en: `Move ${count} reports to folder...`,
              fr: `Déplacer ${count} rapports vers un dossier...`,
              pt: `Mover ${count} relatórios para uma pasta...`,
            })
          : t3({
              en: "Move to folder...",
              fr: "Déplacer vers un dossier...",
              pt: "Mover para uma pasta...",
            }),
        icon: "folder",
        onClick: () => handleMoveToFolder(report),
      },
      {
        label: isMultiSelect
          ? t3({
              en: `Duplicate ${count} reports...`,
              fr: `Dupliquer ${count} rapports...`,
              pt: `Duplicar ${count} relatórios...`,
            })
          : t3({ en: "Duplicate...", fr: "Dupliquer...", pt: "Duplicar..." }),
        icon: "copy",
        onClick: () => handleDuplicate(report),
      },
      {
        label: isMultiSelect
          ? t3({
              en: `Delete ${count} reports`,
              fr: `Supprimer ${count} rapports`,
              pt: `Eliminar ${count} relatórios`,
            })
          : t3(TC.delete),
        icon: "trash",
        intent: "danger",
        onClick: () => handleDelete(report),
      },
    ];
    showMenu({
      anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 },
      items,
    });
  }

  function handleFolderContextMenu(e: MouseEvent, folderId: string) {
    e.preventDefault();
    e.stopPropagation();
    const folder = projectState.reportFolders.find((f) => f.id === folderId);
    if (!folder) return;

    const items: MenuItem[] = [
      {
        label: t3({
          en: "Rename / Change color...",
          fr: "Renommer / Changer la couleur...",
          pt: "Mudar o nome / Mudar a cor...",
        }),
        icon: "pencil",
        onClick: async () => {
          await openComponent({
            element: EditReportFolderModal,
            props: {
              projectId: projectState.id,
              folder,
            },
          });
        },
      },
      {
        label: t3({
          en: "Delete folder",
          fr: "Supprimer le dossier",
          pt: "Eliminar pasta",
        }),
        icon: "trash",
        intent: "danger",
        onClick: async () => {
          const deleteAction = createDeleteAction(
            t3({
              en: "Are you sure you want to delete this folder? Reports will be moved to General.",
              fr: "Êtes-vous sûr de vouloir supprimer ce dossier ? Les rapports seront déplacés dans Général.",
              pt: "Tem a certeza de que pretende eliminar esta pasta? Os relatórios serão movidos para Geral.",
            }),
            () =>
              serverActions.deleteReportFolder({
                projectId: projectState.id,
                folder_id: folderId,
              }),
            () => {},
          );
          await deleteAction.click();
        },
      },
    ];
    showMenu({
      anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 },
      items,
    });
  }

  const renderGroupOption = (item: ListItem<string>) => {
    const opt = groupOptions().find((g) => g.value === item.id);
    if (!opt) return <span>{item.label}</span>;

    const mode = reportGroupingMode();
    if (mode === "folders") {
      const isUserFolder = !item.id.startsWith("_");
      return (
        <div
          class="flex items-center gap-2"
          onContextMenu={
            isUserFolder
              ? (e) => handleFolderContextMenu(e, item.id)
              : undefined
          }
        >
          <div
            class="h-2.5 w-2.5 flex-none rounded-full"
            style={{
              "background-color": opt.color ?? getColor({ key: "base300" }),
            }}
          />
          <span class="flex-1 truncate">{opt.label}</span>
          <span class="ui-text-caption">({opt.count})</span>
        </div>
      );
    }
    return (
      <div class="flex items-center justify-between gap-2">
        <span class="truncate">{opt.label}</span>
        <span class="ui-text-caption">({opt.count})</span>
      </div>
    );
  };

  async function attemptAddReport() {
    const group = reportSelectedGroup();
    const currentFolderId =
      reportGroupingMode() === "folders" && group && !group.startsWith("_")
        ? group
        : null;
    const res = await openComponent({
      element: AddReportForm,
      props: {
        projectId: projectState.id,
        folders: projectState.reportFolders,
        currentFolderId,
      },
    });
    if (res === undefined) {
      return;
    }
    const report = projectState.reports.find((r) => r.id === res.newReportId);
    await openReport(
      res.newReportId,
      report?.label || t3({ en: "Report", fr: "Rapport", pt: "Relatório" }),
    );
  }

  return (
    <FrameTop
      panelChildren={
        <div class="h-full w-full" data-cursor-zone="header">
          <HeadingBar
            heading={t3({ en: "Reports", fr: "Rapports", pt: "Relatórios" })}
            searchText={searchText()}
            setSearchText={setSearchText}
            centerChildren={
              <SortControl
                value={reportSortMode()}
                onChange={setReportSortMode}
              />
            }
          >
            <Show when={!projectState.isLocked}>
              <Button onClick={attemptAddReport} iconName="plus">
                {t3({
                  en: "Create report",
                  fr: "Créer un rapport",
                  pt: "Criar relatório",
                })}
              </Button>
            </Show>
          </HeadingBar>
        </div>
      }
    >
      <FrameLeftResizable
        startingWidth={180}
        minWidth={170}
        maxWidth={300}
        hoverOffset="offset-for-border-1-on-left"
        panelChildren={
          <div
            class="border-base-300 flex h-full w-full flex-col border-r"
            data-cursor-zone="folders"
          >
            <div class="border-base-300 border-b p-3">
              <Select
                options={getGroupingOptions()}
                value={reportGroupingMode()}
                onChange={(v) => setReportGroupingMode(v as ReportGroupingMode)}
                fullWidth
              />
            </div>
            <div class="flex-1 overflow-auto p-2">
              <SelectList
                items={groupOptions().map((g) => ({
                  id: g.value,
                  label: g.label,
                }))}
                value={reportSelectedGroup() ?? undefined}
                onChange={setReportSelectedGroup}
                renderItem={renderGroupOption}
                fullWidth
              />
              <Show when={reportGroupingMode() === "folders"}>
                <div class="py-3">
                  <Button
                    size="sm"
                    outline
                    iconName="plus"
                    onClick={async () => {
                      await openComponent({
                        element: EditReportFolderModal,
                        props: { projectId: projectState.id },
                      });
                    }}
                  >
                    {t3({
                      en: "New folder",
                      fr: "Nouveau dossier",
                      pt: "Nova pasta",
                    })}
                  </Button>
                </div>
              </Show>
            </div>
          </div>
        }
      >
        <div
          class="ui-gap ui-pad grid h-full w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start items-start overflow-auto"
          data-page-cursor-surface
          onClick={() => selection.clear()}
        >
          <For
            each={filteredReports()}
            fallback={
              <div class="text-base-content-muted text-sm">
                {searchText().length >= 3
                  ? t3({
                      en: "No matching reports",
                      fr: "Aucun rapport correspondant",
                      pt: "Nenhum relatório correspondente",
                    })
                  : t3({
                      en: "No reports yet",
                      fr: "Aucun rapport pour le moment",
                      pt: "Ainda não há relatórios",
                    })}
              </div>
            }
          >
            {(report) => {
              const isSelected = () => selection.isSelected(report.id);
              return (
                <div class="group row-span-2 grid min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-subgrid gap-y-1">
                  <div class="font-400 text-base-content pointer-events-none pb-1 text-xs italic select-none">
                    {report.label}
                  </div>
                  <div
                    class="bg-base-100 relative cursor-pointer overflow-clip rounded border"
                    classList={{
                      "border-primary": isSelected(),
                      "hover:border-primary": !isSelected(),
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      selection.handleClick(report.id, e, () =>
                        openReport(report.id, report.label),
                      );
                    }}
                    onContextMenu={(e) => handleContextMenu(e, report)}
                  >
                    <SelectionCircle
                      isSelected={isSelected()}
                      onClick={(e) => selection.handleClick(report.id, e)}
                    />
                    <div class="pointer-events-none absolute bottom-1 left-1 z-10">
                      <PresenceAvatars
                        peers={otherPeers().filter(
                          (peer) => peer.reportId === report.id,
                        )}
                        size="sm"
                        showEditingPulse
                      />
                    </div>
                    <div
                      class="bg-base-100 overflow-hidden p-4"
                      style={{ "aspect-ratio": "16/9" }}
                    >
                      <Show
                        when={report.preview.lines.length > 0}
                        fallback={
                          <div class="ui-text-caption italic">
                            {t3({
                              en: "Empty report",
                              fr: "Rapport vide",
                              pt: "Relatório vazio",
                            })}
                          </div>
                        }
                      >
                        <For each={report.preview.lines}>
                          {(line) => (
                            <div
                              class="truncate text-[0.7rem] leading-snug"
                              classList={{
                                "text-base-content font-700":
                                  line.headingLevel === 1,
                                "text-base-content font-400":
                                  line.headingLevel >= 2,
                                "text-base-content-muted":
                                  line.headingLevel === 0,
                              }}
                            >
                              {line.text}
                            </div>
                          )}
                        </For>
                      </Show>
                      <Show
                        when={
                          report.preview.figureCount > 0 ||
                          report.preview.imageCount > 0
                        }
                      >
                        <div class="text-base-content-muted pt-2 text-[0.65rem]">
                          {previewCounts(report.preview)}
                        </div>
                      </Show>
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </FrameLeftResizable>
    </FrameTop>
  );
}
