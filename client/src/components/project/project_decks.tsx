import {
  SlideDeckGroupingMode,
  SlideDeckSummary,
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
import { AddDeckForm } from "./add_deck";
import { EditDeckFolderModal } from "./edit_deck_folder_modal";
import { MoveDeckToFolderModal } from "./move_deck_to_folder_modal";
import { DuplicateDeckModal } from "./duplicate_deck_modal";
import { ProjectAiSlideDeck } from "../slide_deck";
import { SlideDeckThumbnail } from "../slide_deck/slide_deck_thumbnail";
import { projectState } from "~/state/project/t1_store";
import { useAIProjectContext } from "~/components/project_ai/context";
import {
  deckGroupingMode,
  setDeckGroupingMode,
  deckSelectedGroup,
  setDeckSelectedGroup,
  deckSortMode,
  setDeckSortMode,
} from "~/state/t4_ui";
import { SortControl, sortBySortMode } from "~/components/_shared/sort_control";
import { serverActions } from "~/server_actions";

function getGroupingOptions(): { value: SlideDeckGroupingMode; label: string }[] {
  return [
    { value: "folders", label: t3({ en: "By folder", fr: "Par dossier", pt: "Por pasta" }) },
    { value: "flat", label: t3({ en: "Flat list", fr: "Liste simple", pt: "Lista simples" }) },
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

export function ProjectDecks(p: ExtendedProps) {
  const { aiContext } = useAIProjectContext();

  async function openDeck(deckId: string, deckLabel: string) {
    await p.openProjectEditor({
      element: ProjectAiSlideDeck,
      props: {
        deckId,
        reportLabel: deckLabel,
        projectState: projectState,
        returnToContext: aiContext(),
      },
    });
  }

  const [searchText, setSearchText] = createSignal<string>("");

  const filteredBySearch = () => {
    const decks = projectState.slideDecks;
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
          { value: "_unfiled", label: t3(TC.general), count: generalCount },
        ];
        groups.push(
          ...projectState.slideDeckFolders.map((f) => ({
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
          { value: "_all", label: t3({ en: "All slide decks", fr: "Toutes les présentations", pt: "Todas as apresentações" }), count: decks.length },
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

    let selected: SlideDeckSummary[];
    switch (mode) {
      case "folders":
        if (group === "_unfiled") {
          selected = decks.filter((d) => d.folderId === null);
        } else {
          selected = decks.filter((d) => d.folderId === group);
        }
        break;
      default:
        selected = decks;
    }

    return sortBySortMode(
      selected,
      deckSortMode(),
      (d) => d.label,
      (d) => d.lastUpdated,
    );
  };

  createEffect(() => {
    deckGroupingMode();
    const groups = groupOptions();
    const current = deckSelectedGroup();
    if (groups.length > 0 && !groups.find((g) => g.value === current)) {
      setDeckSelectedGroup(groups[0].value);
    }
  });

  const selection = createSelectionController<string>({
    ids: () => filteredDecks().map((d) => d.id),
    mode: "multi",
  });

  // Batch operation handlers

  async function handleMoveToFolder(deck: SlideDeckSummary) {
    const idsToMove = selection.getBatchIds(deck.id);

    await openComponent({
      element: MoveDeckToFolderModal,
      props: {
        projectId: projectState.id,
        deckIds: idsToMove,
        currentFolderId: deck.folderId,
        folders: projectState.slideDeckFolders,
      },
    });

    selection.clear();
  }

  async function handleDuplicate(deck: SlideDeckSummary) {
    const idsToDuplicate = selection.getBatchIds(deck.id);

    const deckDetails = idsToDuplicate
      .map((id) => projectState.slideDecks.find((d) => d.id === id))
      .filter((d): d is SlideDeckSummary => d !== undefined)
      .map((d) => ({ id: d.id, label: d.label, folderId: d.folderId }));

    await openComponent({
      element: DuplicateDeckModal,
      props: {
        projectId: projectState.id,
        deckDetails,
        folders: projectState.slideDeckFolders,
      },
    });

    selection.clear();
  }

  async function handleDelete(deck: SlideDeckSummary) {
    const idsToDelete = selection.getBatchIds(deck.id);

    const confirmText =
      idsToDelete.length > 1
        ? t3({ en: `Are you sure you want to delete ${idsToDelete.length} slide decks?`, fr: `Êtes-vous sûr de vouloir supprimer ${idsToDelete.length} présentations ?`, pt: `Tem a certeza de que pretende eliminar ${idsToDelete.length} apresentações?` })
        : t3({ en: "Are you sure you want to delete this slide deck?", fr: "Êtes-vous sûr de vouloir supprimer cette présentation ?", pt: "Tem a certeza de que pretende eliminar esta apresentação?" });

    const deleteAction = createDeleteAction(
      confirmText,
      async () => {
        const promises = idsToDelete.map((id) =>
          serverActions.deleteSlideDeck({
            projectId: projectState.id,
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
        selection.clear();
      },
    );
    await deleteAction.click();
  }

  function handleContextMenu(e: MouseEvent, deck: SlideDeckSummary) {
    e.preventDefault();

    const isMultiSelect =
      selection.isSelected(deck.id) && selection.selectedCount() > 1;
    const count = selection.selectedCount();

    const items: MenuItem[] = [
      {
        label: isMultiSelect
          ? t3({ en: `Move ${count} decks to folder...`, fr: `Déplacer ${count} présentations vers un dossier...`, pt: `Mover ${count} apresentações para uma pasta...` })
          : t3({ en: "Move to folder...", fr: "Déplacer vers un dossier...", pt: "Mover para uma pasta..." }),
        icon: "folder",
        onClick: () => handleMoveToFolder(deck),
      },
      {
        label: isMultiSelect
          ? t3({ en: `Duplicate ${count} decks...`, fr: `Dupliquer ${count} présentations...`, pt: `Duplicar ${count} apresentações...` })
          : t3({ en: "Duplicate...", fr: "Dupliquer...", pt: "Duplicar..." }),
        icon: "copy",
        onClick: () => handleDuplicate(deck),
      },
      {
        label: isMultiSelect
          ? t3({ en: `Delete ${count} decks`, fr: `Supprimer ${count} présentations`, pt: `Eliminar ${count} apresentações` })
          : t3(TC.delete),
        icon: "trash",
        intent: "danger",
        onClick: () => handleDelete(deck),
      },
    ];
    showMenu({ anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 }, items });
  }

  // Folder context menu

  function handleFolderContextMenu(e: MouseEvent, folderId: string) {
    e.preventDefault();
    e.stopPropagation();
    const folder = projectState.slideDeckFolders.find(
      (f) => f.id === folderId,
    );
    if (!folder) return;

    const items: MenuItem[] = [
      {
        label: t3({ en: "Rename / Change color...", fr: "Renommer / Changer la couleur...", pt: "Mudar o nome / Alterar a cor..." }),
        icon: "pencil",
        onClick: async () => {
          await openComponent({
            element: EditDeckFolderModal,
            props: {
              projectId: projectState.id,
              folder,
            },
          });
        },
      },
      {
        label: t3({ en: "Delete folder", fr: "Supprimer le dossier", pt: "Eliminar pasta" }),
        icon: "trash",
        intent: "danger",
        onClick: async () => {
          const deleteAction = createDeleteAction(
            t3({ en: "Are you sure you want to delete this folder? Slide decks will be moved to General.", fr: "Êtes-vous sûr de vouloir supprimer ce dossier ? Les présentations seront déplacées dans Général.", pt: "Tem a certeza de que pretende eliminar esta pasta? As apresentações serão movidas para Geral." }),
            () =>
              serverActions.deleteSlideDeckFolder({
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

    const mode = deckGroupingMode();
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

  async function attemptAddDeck() {
    const group = deckSelectedGroup();
    const currentFolderId =
      deckGroupingMode() === "folders" && group && !group.startsWith("_")
        ? group
        : null;
    const res = await openComponent({
      element: AddDeckForm,
      props: {
        projectId: projectState.id,
        folders: projectState.slideDeckFolders,
        currentFolderId,
      },
    });
    if (res === undefined) {
      return;
    }
    const deck = projectState.slideDecks.find((d) => d.id === res.newDeckId);
    await openDeck(res.newDeckId, deck?.label || t3({ en: "Slide deck", fr: "Présentation", pt: "Apresentação" }));
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={t3({ en: "Slide decks", fr: "Présentations", pt: "Apresentações" })}
          searchText={searchText()}
          setSearchText={setSearchText}
          class="border-base-300"
          centerChildren={
            <SortControl value={deckSortMode()} onChange={setDeckSortMode} />
          }
        >
          <Show
            when={
              !projectState.isLocked &&
              projectState.projectModules.length > 0
            }
          >
            <Button onClick={attemptAddDeck} iconName="plus">
              {t3({ en: "Create slide deck", fr: "Créer une présentation", pt: "Criar apresentação" })}
            </Button>
          </Show>
        </HeadingBar>
      }
    >
      <Show
        when={projectState.projectModules.length > 0}
        fallback={
          <div class="ui-pad text-neutral text-sm">
            {t3({ en: "You need to enable at least one module to create slide decks", fr: "Vous devez activer au moins un module pour créer des présentations", pt: "Tem de ativar pelo menos um módulo para criar apresentações" })}
          </div>
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
                  value={deckGroupingMode()}
                  onChange={(v) =>
                    setDeckGroupingMode(v as SlideDeckGroupingMode)
                  }
                  fullWidth
                />
              </div>
              <div class="flex-1 overflow-auto p-2">
                <SelectList
                  items={groupOptions().map((g) => ({
                    id: g.value,
                    label: g.label,
                  }))}
                  value={deckSelectedGroup() ?? undefined}
                  onChange={setDeckSelectedGroup}
                  renderItem={renderGroupOption}
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
                          props: { projectId: projectState.id },
                        });
                      }}
                    >
                      {t3({ en: "New folder", fr: "Nouveau dossier", pt: "Nova pasta" })}
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
              each={filteredDecks()}
              fallback={
                <div class="text-neutral text-sm">
                  {searchText().length >= 3
                    ? t3({ en: "No matching decks", fr: "Aucune présentation correspondante", pt: "Nenhuma apresentação correspondente" })
                    : t3({ en: "No slide decks yet", fr: "Aucune présentation pour le moment", pt: "Ainda não há apresentações" })}
                </div>
              }
            >
              {(deck) => {
                const isSelected = () => selection.isSelected(deck.id);
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
                        selection.handleClick(deck.id, e, () =>
                          openDeck(deck.id, deck.label),
                        );
                      }}
                      onContextMenu={(e) => handleContextMenu(e, deck)}
                    >
                      <SelectionCircle
                        isSelected={isSelected()}
                        onClick={(e) => selection.handleClick(deck.id, e)}
                      />
                      <Show
                        when={deck.firstSlideId}
                        fallback={
                          <div
                            class="bg-base-200 flex items-center justify-center"
                            style={{ "aspect-ratio": "16/9" }}
                          >
                            <span class="text-neutral text-xs">{t3({ en: "No slides", fr: "Aucune diapositive", pt: "Sem diapositivos" })}</span>
                          </div>
                        }
                      >
                        <SlideDeckThumbnail
                          projectId={projectState.id}
                          deckId={deck.id}
                          slideId={deck.firstSlideId!}
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
