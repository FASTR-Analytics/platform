import {
  ReportGroupingMode,
  ReportPreview,
  ReportSummary,
  t3,
  TC,
} from "lib";
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
import { projectState } from "~/state/project/t1_store";
import { useAIProjectContext } from "~/components/project_ai/context";
import {
  reportGroupingMode,
  setReportGroupingMode,
  reportSelectedGroup,
  setReportSelectedGroup,
} from "~/state/t4_ui";
import { serverActions } from "~/server_actions";

function previewCounts(preview: ReportPreview): string {
  const parts: string[] = [];
  if (preview.figureCount > 0) {
    parts.push(
      t3({
        en: `${preview.figureCount} ${preview.figureCount === 1 ? "figure" : "figures"}`,
        fr: `${preview.figureCount} figure${preview.figureCount === 1 ? "" : "s"}`,
      }),
    );
  }
  if (preview.imageCount > 0) {
    parts.push(
      t3({
        en: `${preview.imageCount} ${preview.imageCount === 1 ? "image" : "images"}`,
        fr: `${preview.imageCount} image${preview.imageCount === 1 ? "" : "s"}`,
      }),
    );
  }
  return parts.join(" · ");
}

function getGroupingOptions(): { value: ReportGroupingMode; label: string }[] {
  return [
    { value: "folders", label: t3({ en: "By folder", fr: "Par dossier" }) },
    { value: "flat", label: t3({ en: "Flat list", fr: "Liste simple" }) },
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
          { value: "_all", label: t3({ en: "All reports", fr: "Tous les rapports" }), count: reports.length },
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

    switch (mode) {
      case "folders":
        if (group === "_unfiled") {
          return reports.filter((r) => r.folderId === null);
        }
        return reports.filter((r) => r.folderId === group);
      case "flat":
        return [...reports].sort((a, b) => a.label.localeCompare(b.label));
      default:
        return reports;
    }
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
        ? t3({ en: `Are you sure you want to delete ${idsToDelete.length} reports?`, fr: `Êtes-vous sûr de vouloir supprimer ${idsToDelete.length} rapports ?` })
        : t3({ en: "Are you sure you want to delete this report?", fr: "Êtes-vous sûr de vouloir supprimer ce rapport ?" });

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
          ? t3({ en: `Move ${count} reports to folder...`, fr: `Déplacer ${count} rapports vers un dossier...` })
          : t3({ en: "Move to folder...", fr: "Déplacer vers un dossier..." }),
        icon: "folder",
        onClick: () => handleMoveToFolder(report),
      },
      {
        label: isMultiSelect
          ? t3({ en: `Duplicate ${count} reports...`, fr: `Dupliquer ${count} rapports...` })
          : t3({ en: "Duplicate...", fr: "Dupliquer..." }),
        icon: "copy",
        onClick: () => handleDuplicate(report),
      },
      {
        label: isMultiSelect
          ? t3({ en: `Delete ${count} reports`, fr: `Supprimer ${count} rapports` })
          : t3(TC.delete),
        icon: "trash",
        intent: "danger",
        onClick: () => handleDelete(report),
      },
    ];
    showMenu({ anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 }, items });
  }

  function handleFolderContextMenu(e: MouseEvent, folderId: string) {
    e.preventDefault();
    e.stopPropagation();
    const folder = projectState.reportFolders.find((f) => f.id === folderId);
    if (!folder) return;

    const items: MenuItem[] = [
      {
        label: t3({ en: "Rename / Change color...", fr: "Renommer / Changer la couleur..." }),
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
        label: t3({ en: "Delete folder", fr: "Supprimer le dossier" }),
        icon: "trash",
        intent: "danger",
        onClick: async () => {
          const deleteAction = createDeleteAction(
            t3({ en: "Are you sure you want to delete this folder? Reports will be moved to General.", fr: "Êtes-vous sûr de vouloir supprimer ce dossier ? Les rapports seront déplacés dans Général." }),
            () =>
              serverActions.deleteReportFolder({
                projectId: projectState.id,
                folder_id: folderId,
              }),
            () => { },
          );
          await deleteAction.click();
        },
      },
    ];
    showMenu({ anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 }, items });
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
          <span class="text-neutral text-xs">({opt.count})</span>
        </div>
      );
    }
    return (
      <div class="flex items-center justify-between gap-2">
        <span class="truncate">{opt.label}</span>
        <span class="text-neutral text-xs">({opt.count})</span>
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
    await openReport(res.newReportId, report?.label || t3({ en: "Report", fr: "Rapport" }));
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={t3({ en: "Reports", fr: "Rapports" })}
          searchText={searchText()}
          setSearchText={setSearchText}
          class="border-base-300"
        >
          <Show when={!projectState.isLocked}>
            <Button onClick={attemptAddReport} iconName="plus">
              {t3({ en: "Create report", fr: "Créer un rapport" })}
            </Button>
          </Show>
        </HeadingBar>
      }
    >
      <FrameLeftResizable
        startingWidth={180}
        minWidth={170}
        maxWidth={300}
        hoverOffset="offset-for-border-1-on-left"
        panelChildren={
          <div class="border-base-300 flex h-full w-full flex-col border-r">
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
                    {t3({ en: "New folder", fr: "Nouveau dossier" })}
                  </Button>
                </div>
              </Show>
            </div>
          </div>
        }
      >
        <div
          class="ui-gap ui-pad grid h-full w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start items-start overflow-auto"
          onClick={() => selection.clear()}
        >
          <For
            each={filteredReports()}
            fallback={
              <div class="text-neutral text-sm">
                {searchText().length >= 3
                  ? t3({ en: "No matching reports", fr: "Aucun rapport correspondant" })
                  : t3({ en: "No reports yet", fr: "Aucun rapport pour le moment" })}
              </div>
            }
          >
            {(report) => {
              const isSelected = () => selection.isSelected(report.id);
              return (
                <div class="group grid min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-subgrid row-span-2 gap-y-1">
                  <div class="font-400 text-base-content text-xs italic select-none pointer-events-none pb-1">
                    {report.label}
                  </div>
                  <div
                    class="relative border rounded overflow-clip bg-white cursor-pointer"
                    classList={{
                      "border-base-300": !isSelected(),
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
                    <div
                      class="bg-white overflow-hidden p-4"
                      style={{ "aspect-ratio": "16/9" }}
                    >
                      <Show
                        when={report.preview.lines.length > 0}
                        fallback={
                          <div class="text-neutral text-xs italic">
                            {t3({ en: "Empty report", fr: "Rapport vide" })}
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
                                "text-base-content/70": line.headingLevel === 0,
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
                        <div class="text-neutral pt-2 text-[0.65rem]">
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
