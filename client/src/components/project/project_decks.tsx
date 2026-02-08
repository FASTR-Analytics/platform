import {
  InstanceDetail,
  SlideDeckGroupingMode,
  SlideDeckSummary,
  isFrench,
  t,
} from "lib";
import {
  Button,
  FrameLeftResizable,
  FrameTop,
  HeadingBar,
  OpenEditorProps,
  Select,
  SelectList,
  getColor,
  openComponent,
  showMenu,
  timActionDelete,
  type MenuItem,
  type SelectOption,
} from "panther";
import { For, Show, createEffect, createSignal } from "solid-js";
import { AddDeckForm } from "./add_deck";
import { EditDeckFolderModal } from "./edit_deck_folder_modal";
import { MoveDeckToFolderModal } from "./move_deck_to_folder_modal";
import { DuplicateDeckModal } from "./duplicate_deck_modal";
import { ProjectAiSlideDeck } from "../slide_deck";
import { SlideDeckThumbnail } from "../slide_deck/slide_deck_thumbnail";
import { useProjectDetail, useRefetchProjectDetail } from "~/components/project_runner/mod";
import { useAIProjectContext } from "~/components/project_ai/context";
import {
  deckGroupingMode,
  setDeckGroupingMode,
  deckSelectedGroup,
  setDeckSelectedGroup,
} from "~/state/ui";
import { serverActions } from "~/server_actions";

const GROUPING_OPTIONS: { value: SlideDeckGroupingMode; label: string }[] = [
  { value: "folders", label: "By folder" },
  { value: "flat", label: "Flat list" },
];

type GroupOption = {
  value: string;
  label: string;
  count: number;
  color?: string | null;
};

type ExtendedProps = {
  instanceDetail: InstanceDetail;
  isGlobalAdmin: boolean;
  openProjectEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
};

export function ProjectDecks(p: ExtendedProps) {
  const projectDetail = useProjectDetail();
  const refetchProjectDetail = useRefetchProjectDetail();
  const { aiContext } = useAIProjectContext();

  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = createSignal<number | null>(
    null,
  );

  function clearSelection() {
    setSelectedIds(new Set<string>());
    setLastSelectedIndex(null);
  }

  async function openDeck(deckId: string, deckLabel: string) {
    await p.openProjectEditor({
      element: ProjectAiSlideDeck,
      props: {
        deckId,
        reportLabel: deckLabel,
        projectDetail,
        instanceDetail: p.instanceDetail,
        isGlobalAdmin: p.isGlobalAdmin,
        returnToContext: aiContext(),
      },
    });
    await refetchProjectDetail();
  }

  const [searchText, setSearchText] = createSignal<string>("");

  const filteredBySearch = () => {
    const decks = projectDetail.slideDecks;
    if (searchText().length < 3) return decks;
    const searchLower = searchText().toLowerCase();
    return decks.filter((d) => d.label.toLowerCase().includes(searchLower));
  };

  const groupOptions = (): GroupOption[] => {
    const decks = filteredBySearch();
    const mode = deckGroupingMode();

    switch (mode) {
      case "folders": {
        const generalCount = decks.filter((d) => d.folderId === null).length;
        const groups: GroupOption[] = [
          { value: "_unfiled", label: "General", count: generalCount },
        ];
        groups.push(
          ...projectDetail.slideDeckFolders.map((f) => ({
            value: f.id,
            label: f.label,
            count: decks.filter((d) => d.folderId === f.id).length,
            color: f.color,
          })),
        );
        return groups;
      }
      case "flat":
        return [
          { value: "_all", label: "All Slide Decks", count: decks.length },
        ];
      default:
        return [];
    }
  };

  const filteredDecks = () => {
    const decks = filteredBySearch();
    const group = deckSelectedGroup();
    const mode = deckGroupingMode();

    if (!group) return [];

    switch (mode) {
      case "folders":
        if (group === "_unfiled") {
          return decks.filter((d) => d.folderId === null);
        }
        return decks.filter((d) => d.folderId === group);
      case "flat":
        return [...decks].sort((a, b) => a.label.localeCompare(b.label));
      default:
        return decks;
    }
  };

  createEffect(() => {
    deckGroupingMode();
    const groups = groupOptions();
    const current = deckSelectedGroup();
    if (groups.length > 0 && !groups.find((g) => g.value === current)) {
      setDeckSelectedGroup(groups[0].value);
    }
  });

  // Selection handlers

  function handleDeckClick(
    index: number,
    deck: SlideDeckSummary,
    event: MouseEvent,
    isCircleClick: boolean,
  ) {
    if (isCircleClick) {
      event.stopPropagation();

      if (event.metaKey || event.ctrlKey) {
        const newSelected = new Set(selectedIds());
        if (newSelected.has(deck.id)) {
          newSelected.delete(deck.id);
        } else {
          newSelected.add(deck.id);
        }
        setSelectedIds(newSelected);
        setLastSelectedIndex(index);
        return;
      }

      if (event.shiftKey && lastSelectedIndex() !== null) {
        event.preventDefault();
        const newSelected = new Set(selectedIds());
        const start = Math.min(lastSelectedIndex()!, index);
        const end = Math.max(lastSelectedIndex()!, index);
        const decks = filteredDecks();
        for (let i = start; i <= end; i++) {
          if (decks[i]) {
            newSelected.add(decks[i].id);
          }
        }
        setSelectedIds(newSelected);
        return;
      }

      const currentlySelected = selectedIds();
      if (currentlySelected.has(deck.id)) {
        const newSelected = new Set(currentlySelected);
        newSelected.delete(deck.id);
        setSelectedIds(newSelected);
      } else {
        setSelectedIds(new Set([deck.id]));
      }
      setLastSelectedIndex(index);
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      const newSelected = new Set(selectedIds());
      if (newSelected.has(deck.id)) {
        newSelected.delete(deck.id);
      } else {
        newSelected.add(deck.id);
      }
      setSelectedIds(newSelected);
      setLastSelectedIndex(index);
      return;
    }

    if (event.shiftKey && lastSelectedIndex() !== null) {
      event.preventDefault();
      const newSelected = new Set(selectedIds());
      const start = Math.min(lastSelectedIndex()!, index);
      const end = Math.max(lastSelectedIndex()!, index);
      const decks = filteredDecks();
      for (let i = start; i <= end; i++) {
        if (decks[i]) {
          newSelected.add(decks[i].id);
        }
      }
      setSelectedIds(newSelected);
      return;
    }

    clearSelection();
    openDeck(deck.id, deck.label);
  }

  // Batch operation handlers

  async function handleMoveToFolder(deck: SlideDeckSummary) {
    const selected = selectedIds();
    const isItemSelected = selected.has(deck.id);
    const shouldMoveMultiple = isItemSelected && selected.size > 1;
    const idsToMove = shouldMoveMultiple ? Array.from(selected) : [deck.id];

    await openComponent({
      element: MoveDeckToFolderModal,
      props: {
        projectId: projectDetail.id,
        deckIds: idsToMove,
        currentFolderId: deck.folderId,
        folders: projectDetail.slideDeckFolders,
      },
    });

    clearSelection();
  }

  async function handleDuplicate(deck: SlideDeckSummary) {
    const selected = selectedIds();
    const isItemSelected = selected.has(deck.id);
    const shouldDuplicateMultiple = isItemSelected && selected.size > 1;
    const idsToDuplicate = shouldDuplicateMultiple
      ? Array.from(selected)
      : [deck.id];

    const deckDetails = idsToDuplicate
      .map((id) => projectDetail.slideDecks.find((d) => d.id === id))
      .filter((d): d is SlideDeckSummary => d !== undefined)
      .map((d) => ({ id: d.id, label: d.label, folderId: d.folderId }));

    await openComponent({
      element: DuplicateDeckModal,
      props: {
        projectId: projectDetail.id,
        deckDetails,
        folders: projectDetail.slideDeckFolders,
      },
    });

    clearSelection();
  }

  async function handleDelete(deck: SlideDeckSummary) {
    const selected = selectedIds();
    const isItemSelected = selected.has(deck.id);
    const shouldDeleteMultiple = isItemSelected && selected.size > 1;
    const idsToDelete = shouldDeleteMultiple
      ? Array.from(selected)
      : [deck.id];

    const confirmText =
      idsToDelete.length > 1
        ? `Are you sure you want to delete ${idsToDelete.length} slide decks?`
        : "Are you sure you want to delete this slide deck?";

    const deleteAction = timActionDelete(
      confirmText,
      async () => {
        const promises = idsToDelete.map((id) =>
          serverActions.deleteSlideDeck({
            projectId: projectDetail.id,
            deck_id: id,
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
        clearSelection();
      },
    );
    await deleteAction.click();
  }

  function handleContextMenu(e: MouseEvent, deck: SlideDeckSummary) {
    e.preventDefault();

    const isMultiSelect =
      selectedIds().has(deck.id) && selectedIds().size > 1;
    const count = selectedIds().size;

    const items: MenuItem[] = [
      {
        label: isMultiSelect
          ? `Move ${count} decks to folder...`
          : "Move to folder...",
        icon: "folder",
        onClick: () => handleMoveToFolder(deck),
      },
      {
        label: isMultiSelect
          ? `Duplicate ${count} decks...`
          : "Duplicate...",
        icon: "copy",
        onClick: () => handleDuplicate(deck),
      },
      {
        label: isMultiSelect
          ? `Delete ${count} decks`
          : "Delete",
        icon: "trash",
        intent: "danger",
        onClick: () => handleDelete(deck),
      },
    ];
    showMenu({ x: e.clientX, y: e.clientY, items });
  }

  // Folder context menu

  function handleFolderContextMenu(e: MouseEvent, folderId: string) {
    e.preventDefault();
    e.stopPropagation();
    const folder = projectDetail.slideDeckFolders.find(
      (f) => f.id === folderId,
    );
    if (!folder) return;

    const items: MenuItem[] = [
      {
        label: "Rename / Change color...",
        icon: "pencil",
        onClick: async () => {
          await openComponent({
            element: EditDeckFolderModal,
            props: {
              projectId: projectDetail.id,
              folder,
            },
          });
        },
      },
      {
        label: "Delete folder",
        icon: "trash",
        intent: "danger",
        onClick: async () => {
          const deleteAction = timActionDelete(
            "Are you sure you want to delete this folder? Slide decks will be moved to General.",
            () =>
              serverActions.deleteSlideDeckFolder({
                projectId: projectDetail.id,
                folder_id: folderId,
              }),
            () => { },
          );
          await deleteAction.click();
        },
      },
    ];
    showMenu({ x: e.clientX, y: e.clientY, items });
  }

  const renderGroupOption = (selectOpt: SelectOption<string>) => {
    const opt = groupOptions().find((g) => g.value === selectOpt.value);
    if (!opt) return <span>{selectOpt.label}</span>;

    const mode = deckGroupingMode();
    if (mode === "folders") {
      const isUserFolder = !selectOpt.value.startsWith("_");
      return (
        <div
          class="flex items-center gap-2"
          onContextMenu={
            isUserFolder
              ? (e) => handleFolderContextMenu(e, selectOpt.value)
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

  async function attemptAddDeck() {
    const group = deckSelectedGroup();
    const currentFolderId =
      deckGroupingMode() === "folders" && group && !group.startsWith("_")
        ? group
        : null;
    const res = await openComponent({
      element: AddDeckForm,
      props: {
        projectId: projectDetail.id,
        folders: projectDetail.slideDeckFolders,
        currentFolderId,
      },
    });
    if (res === undefined) {
      return;
    }
    const deck = projectDetail.slideDecks.find((d) => d.id === res.newDeckId);
    await openDeck(res.newDeckId, deck?.label || "Slide Deck");
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading="Slide decks"
          searchText={searchText()}
          setSearchText={setSearchText}
          french={isFrench()}
          class="border-base-300"
        >
          <Show
            when={
              !projectDetail.isLocked &&
              projectDetail.projectModules.length > 0
            }
          >
            <Button onClick={attemptAddDeck} iconName="plus">
              Create slide deck
            </Button>
          </Show>
        </HeadingBar>
      }
    >
      <Show
        when={projectDetail.projectModules.length > 0}
        fallback={
          <div class="ui-pad text-neutral text-sm">
            {t(
              "You need to enable at least one module to create slide decks",
            )}
          </div>
        }
      >
        <FrameLeftResizable
          startingWidth={180}
          minWidth={170}
          maxWidth={300}
          panelChildren={
            <div class="border-base-300 flex h-full w-full flex-col border-r">
              <div class="border-base-300 border-b p-3">
                <Select
                  options={GROUPING_OPTIONS}
                  value={deckGroupingMode()}
                  onChange={(v) =>
                    setDeckGroupingMode(v as SlideDeckGroupingMode)
                  }
                  fullWidth
                />
              </div>
              <div class="flex-1 overflow-auto p-2">
                <SelectList
                  options={groupOptions()}
                  value={deckSelectedGroup() ?? undefined}
                  onChange={setDeckSelectedGroup}
                  renderOption={renderGroupOption}
                  fullWidth
                />
                <Show when={deckGroupingMode() === "folders"}>
                  <div class="py-3">
                    <Button
                      size="sm"
                      outline
                      iconName="plus"
                      onClick={async () => {
                        await openComponent({
                          element: EditDeckFolderModal,
                          props: { projectId: projectDetail.id },
                        });
                      }}
                    >
                      New folder
                    </Button>
                  </div>
                </Show>
              </div>
            </div>
          }
        >
          <div
            class="ui-gap ui-pad grid h-full w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start items-start overflow-auto"
            onClick={() => clearSelection()}
          >
            <For
              each={filteredDecks()}
              fallback={
                <div class="text-neutral text-sm">
                  {searchText().length >= 3
                    ? "No matching decks"
                    : "No slide decks yet"}
                </div>
              }
            >
              {(deck, i) => {
                const isSelected = () => selectedIds().has(deck.id);
                return (
                  <div class="group grid grid-rows-subgrid row-span-2 gap-y-1">
                    <div class="font-400 text-base-content text-xs italic select-none pointer-events-none pb-1">
                      {deck.label}
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
                        handleDeckClick(i(), deck, e, false);
                      }}
                      onContextMenu={(e) => handleContextMenu(e, deck)}
                    >
                      <div
                        class="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full opacity-0 group-hover:opacity-100"
                        classList={{
                          "bg-primary text-primary-content opacity-100":
                            isSelected(),
                          "border border-base-300 bg-transparent hover:bg-base-300 hover:text-white [&:not(:hover)]:text-transparent":
                            !isSelected(),
                        }}
                        onClick={(e) => handleDeckClick(i(), deck, e, true)}
                      >
                        <svg
                          class="h-4 w-4"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fill-rule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clip-rule="evenodd"
                          />
                        </svg>
                      </div>
                      <Show
                        when={deck.firstSlideId}
                        fallback={
                          <div
                            class="bg-base-200 flex items-center justify-center"
                            style={{ "aspect-ratio": "16/9" }}
                          >
                            <span class="text-neutral text-xs">No slides</span>
                          </div>
                        }
                      >
                        <SlideDeckThumbnail
                          projectId={projectDetail.id}
                          slideId={deck.firstSlideId!}
                          deckConfig={deck.config}
                        />
                      </Show>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </FrameLeftResizable>
      </Show>
    </FrameTop>
  );
}
