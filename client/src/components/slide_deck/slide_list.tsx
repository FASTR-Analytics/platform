import {
  t3,
  TC,
  type PackageScope,
  type ProductSummary,
  type RunAuthoringContext,
  type Slide,
  type SlideDeckConfig,
  getDefaultCoverSlide,
  getDefaultSectionSlide,
  getDefaultContentSlide,
} from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  LoadingIndicator,
  type MenuItem,
  MenuTriggerWrapper,
  Slider,
  createDeleteAction,
  openAlert,
  openComponent,
} from "panther";
import SortableVendor, {
  SortableJs,
} from "../../../../panther/_303_components/form_inputs/solid_sortablejs_vendored.tsx";
import { createEffect, createSignal, on, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { CopySlidesToDeckModal } from "./copy_slides_to_deck_modal";
import { SlideCard } from "./slide_card";
import { PresenceAvatars } from "./presence_avatars";
import { otherPeers } from "~/state/instance/collab";
import { setShowAi, showAi } from "~/state/t4_ui";
import { projectAIViewController } from "~/components/project_ai/ai_views";
import { instanceState } from "~/state/instance/t1_store";
import { canEditProduct } from "~/state/instance/product_access";
import { UpdateAllFiguresButton } from "~/components/figure_editor/stale_figure_badge";
import { ProductScopeBadge } from "~/components/products/product_card";
import { collectDeckStaleFigures, updateAllDeckFigures } from "./deck_stale_figures";

type Props = {
  productId: string;
  product: ProductSummary | undefined;
  // The product's live pair and its package's authoring context (D4);
  // undefined until the T1 row and the context have both arrived.
  scope: PackageScope | undefined;
  authoringContext: RunAuthoringContext | undefined;
  slideIds: string[];
  isLoading: boolean;
  deckLabel: string;
  setSelectedSlideIds: (ids: string[]) => void;
  onEditSlide: (slideId: string) => Promise<void>;
  handleClose: () => Promise<void>;
  handleOpenSettings: () => Promise<void>;
  handleOpenProductSettings: () => Promise<void>;
  download: () => Promise<void>;
  share: () => Promise<void>;
  present: () => Promise<void>;
  openVersionHistory: () => Promise<void>;
  deckConfig: SlideDeckConfig;
};

export function SlideList(p: Props) {
  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = createSignal<number | null>(
    null,
  );
  const [slideSize, setSlideSize] = createSignal(400);
  const [isFillWidth, setIsFillWidth] = createSignal(false);

  function updateSelection(newSelected: Set<string>) {
    setSelectedIds(newSelected);
    p.setSelectedSlideIds(Array.from(newSelected));
    projectAIViewController.notify("selected_slides", {
      slideIds: Array.from(newSelected),
    });
  }

  function clearSelection() {
    setSelectedIds(new Set<string>());
    setLastSelectedIndex(null);
    p.setSelectedSlideIds([]);
    projectAIViewController.notify("selected_slides", { slideIds: [] });
    document.querySelectorAll(".sortable-selected").forEach((el) => {
      SortableJs.utils.deselect(el);
    });
  }

  // Local copy of slide order for optimistic drag-and-drop updates
  const [sortableSlideItems, setSortableSlideItems] = createSignal<
    { id: string }[]
  >(p.slideIds.map((id) => ({ id })));

  // Sync local state when props change (from SSE or parent updates)
  createEffect(
    on(
      () => p.slideIds,
      (slideIds) => {
        const currentItems = sortableSlideItems();
        const currentIds = new Set(currentItems.map((i) => i.id));
        const newIds = new Set(slideIds);

        // Sync if items were added/removed (set of IDs changed)
        const setChanged =
          currentIds.size !== newIds.size ||
          !slideIds.every((id) => currentIds.has(id));

        // Sync if order changed (from AI or other external sources)
        // PDS timestamp checking ensures we only see latest state
        const orderChanged = !currentItems.every(
          (item, i) => item.id === slideIds[i],
        );

        if (setChanged || orderChanged) {
          setSortableSlideItems(slideIds.map((id) => ({ id })));
        }
      },
    ),
  );

  function handleSlideClick(
    index: number,
    slideId: string,
    event: MouseEvent | undefined,
    isCircleClick: boolean,
  ) {
    if (isCircleClick) {
      // Cmd/Ctrl + circle click: toggle this item in multi-select
      if (event?.metaKey || event?.ctrlKey) {
        const newSelected = new Set(selectedIds());
        if (newSelected.has(slideId)) {
          newSelected.delete(slideId);
        } else {
          newSelected.add(slideId);
        }
        updateSelection(newSelected);
        setLastSelectedIndex(index);
        syncSelectionWithSortableJS(newSelected);
        return;
      }

      // Shift + circle click: range selection
      if (event?.shiftKey && lastSelectedIndex() !== null) {
        event.preventDefault();
        const newSelected = new Set(selectedIds());
        const start = Math.min(lastSelectedIndex()!, index);
        const end = Math.max(lastSelectedIndex()!, index);
        const items = sortableSlideItems();
        for (let i = start; i <= end; i++) {
          newSelected.add(items[i].id);
        }
        updateSelection(newSelected);
        syncSelectionWithSortableJS(newSelected);
        return;
      }

      // Regular circle click: toggle selection (deselect if already selected, otherwise select only this)
      const currentlySelected = selectedIds();
      let newSelected: Set<string>;
      if (currentlySelected.has(slideId)) {
        newSelected = new Set(currentlySelected);
        newSelected.delete(slideId);
      } else {
        newSelected = new Set([slideId]);
      }
      setSelectedIds(newSelected);
      p.setSelectedSlideIds(Array.from(newSelected));
      setLastSelectedIndex(index);
      syncSelectionWithSortableJS(newSelected);
      return;
    }

    // Cmd/Meta + click on card body toggles
    if (event?.metaKey || event?.ctrlKey) {
      const newSelected = new Set(selectedIds());
      if (newSelected.has(slideId)) {
        newSelected.delete(slideId);
      } else {
        newSelected.add(slideId);
      }
      setSelectedIds(newSelected);
      p.setSelectedSlideIds(Array.from(newSelected));
      setLastSelectedIndex(index);
      syncSelectionWithSortableJS(newSelected);
      return;
    }

    // Shift + click on card body does range selection
    if (event?.shiftKey && lastSelectedIndex() !== null) {
      event.preventDefault();
      const newSelected = new Set(selectedIds());
      const start = Math.min(lastSelectedIndex()!, index);
      const end = Math.max(lastSelectedIndex()!, index);
      const items = sortableSlideItems();
      for (let i = start; i <= end; i++) {
        newSelected.add(items[i].id);
      }
      setSelectedIds(newSelected);
      p.setSelectedSlideIds(Array.from(newSelected));
      syncSelectionWithSortableJS(newSelected);
      return;
    }

    // Regular click - edit slide behavior
    clearSelection();
    p.onEditSlide(slideId);
  }

  function syncSelectionWithSortableJS(selectedSet: Set<string>) {
    // Sync our selection state with SortableJS by manipulating the DOM
    document.querySelectorAll(".slide-card-wrapper").forEach((el) => {
      const parent = el.parentElement;
      if (!parent) return;

      const slideId = parent.dataset.id;
      if (!slideId) return;

      if (selectedSet.has(slideId)) {
        if (!parent.classList.contains("sortable-selected")) {
          parent.classList.add("sortable-selected");
        }
      } else {
        if (parent.classList.contains("sortable-selected")) {
          parent.classList.remove("sortable-selected");
        }
      }
    });
  }

  async function handleDelete(slideId: string) {
    const selected = selectedIds();
    const isSlideSelected = selected.has(slideId);
    const shouldDeleteMultiple = isSlideSelected && selected.size > 1;

    const slideIdsToDelete = shouldDeleteMultiple
      ? Array.from(selected)
      : [slideId];
    const confirmText =
      slideIdsToDelete.length > 1
        ? t3({
            en: `Are you sure you want to delete ${slideIdsToDelete.length} slides?`,
            fr: `Êtes-vous sûr de vouloir supprimer ${slideIdsToDelete.length} diapositives ?`,
            pt: `Tem a certeza de que pretende eliminar ${slideIdsToDelete.length} diapositivos?`,
          })
        : t3({
            en: "Are you sure you want to delete this slide?",
            fr: "Êtes-vous sûr de vouloir supprimer cette diapositive ?",
            pt: "Tem a certeza de que pretende eliminar este diapositivo?",
          });

    const deleteAction = createDeleteAction(
      confirmText,
      () =>
        serverActions.deleteSlides({
          product_id: p.productId,
          slideIds: slideIdsToDelete,
        }),
      () => {
        // Remove from local state immediately
        setSortableSlideItems((items) =>
          items.filter((i) => !slideIdsToDelete.includes(i.id)),
        );
        clearSelection();
      },
    );
    await deleteAction.click();
  }

  async function handleDuplicate(slideId: string) {
    const selected = selectedIds();
    const isSlideSelected = selected.has(slideId);
    const shouldDuplicateMultiple = isSlideSelected && selected.size > 1;

    const slideIdsToDuplicate = shouldDuplicateMultiple
      ? Array.from(selected)
      : [slideId];

    const res = await serverActions.duplicateSlides({
      product_id: p.productId,
      slideIds: slideIdsToDuplicate,
    });

    if (res.success) {
      // Optimistic: insert all duplicates after the last original
      setSortableSlideItems((currentItems) => {
        const newItems = [...currentItems];
        // Find the last original's index
        let lastOriginalIndex = -1;
        for (const originalId of slideIdsToDuplicate) {
          const idx = newItems.findIndex((item) => item.id === originalId);
          if (idx > lastOriginalIndex) {
            lastOriginalIndex = idx;
          }
        }
        // Insert all duplicates after the last original
        if (lastOriginalIndex !== -1) {
          const newSlideItems = res.data.newSlideIds.map((id) => ({ id }));
          newItems.splice(lastOriginalIndex + 1, 0, ...newSlideItems);
        }
        return newItems;
      });
    }
  }

  async function handleReorder(oldSlideIds: string[], newSlideIds: string[]) {
    if (newSlideIds.length !== oldSlideIds.length) return;
    if (newSlideIds.every((id, i) => id === oldSlideIds[i])) return;

    const movedIds: string[] = [];
    let targetPosition:
      | { after: string }
      | { before: string }
      | { toStart: true }
      | { toEnd: true }
      | null = null;

    for (let i = 0; i < newSlideIds.length; i++) {
      const slideAtNewPos = newSlideIds[i];
      const slideAtOldPos = oldSlideIds[i];

      if (slideAtNewPos !== slideAtOldPos) {
        const oldIndex = oldSlideIds.indexOf(slideAtNewPos);
        if (oldIndex !== i) {
          let j = i;
          while (
            j < newSlideIds.length &&
            oldSlideIds.indexOf(newSlideIds[j]) !== j
          ) {
            movedIds.push(newSlideIds[j]);
            j++;
          }

          if (i === 0) {
            targetPosition = { toStart: true };
          } else {
            targetPosition = { after: newSlideIds[i - 1] };
          }
          break;
        }
      }
    }

    if (movedIds.length === 0 || !targetPosition) return;

    const res = await serverActions.moveSlides({
      product_id: p.productId,
      slideIds: movedIds,
      position: targetPosition,
    });
    if (!res.success) {
      // The drag was applied optimistically in setItems; the server rejected
      // the move and notifies nothing on failure, so roll the order back.
      setSortableSlideItems(oldSlideIds.map((id) => ({ id })));
    }
  }

  function getInsertPosition(): { after: string } | { toEnd: true } {
    const items = sortableSlideItems();
    const selected = selectedIds();
    if (selected.size > 0) {
      let maxIndex = -1;
      let afterSlideId = "";
      for (const id of selected) {
        const idx = items.findIndex((i) => i.id === id);
        if (idx > maxIndex) {
          maxIndex = idx;
          afterSlideId = id;
        }
      }
      if (afterSlideId) return { after: afterSlideId };
    }
    return { toEnd: true };
  }

  async function addSlide(slide: Slide) {
    const position = getInsertPosition();
    const afterSlideId = "after" in position ? position.after : null;

    const res = await serverActions.createSlide({
      product_id: p.productId,
      position,
      slide,
    });

    if (res.success) {
      setSortableSlideItems((currentItems) => {
        if (afterSlideId === null) {
          return [...currentItems, { id: res.data.slideId }];
        }
        const afterIndex = currentItems.findIndex((i) => i.id === afterSlideId);
        if (afterIndex === -1) {
          return [...currentItems, { id: res.data.slideId }];
        }
        const newItems = [...currentItems];
        newItems.splice(afterIndex + 1, 0, { id: res.data.slideId });
        return newItems;
      });
    }
  }

  const addSlideMenuItems = (): MenuItem[] => [
    {
      label: t3({ en: "Cover slide", fr: "Diapositive de couverture", pt: "Diapositivo de capa" }),
      icon: "plus",
      onClick: () => addSlide(getDefaultCoverSlide()),
    },
    {
      label: t3({ en: "Section slide", fr: "Diapositive de section", pt: "Diapositivo de secção" }),
      icon: "plus",
      onClick: () => addSlide(getDefaultSectionSlide()),
    },
    {
      label: t3({ en: "Content slide", fr: "Diapositive de contenu", pt: "Diapositivo de conteúdo" }),
      icon: "plus",
      onClick: () => addSlide(getDefaultContentSlide()),
    },
  ];

  // ── Stale figures (D4) ──────────────────────────────────────────────────────
  // Recomputed whenever the deck's slide set changes or the container is
  // reattached or rescoped. The slides are already in the per-slide cache
  // (the cards render from it), so this is a walk, not a fetch storm. The
  // walk awaits per slide, so a monotonic scan id keeps an older re-run from
  // committing its count last.
  const [staleCount, setStaleCount] = createSignal(0);
  const [updatingFigures, setUpdatingFigures] = createSignal(false);
  let staleScanId = 0;

  async function rescanStaleFigures(scope: PackageScope, slideIds: string[]) {
    const scanId = ++staleScanId;
    const stale = await collectDeckStaleFigures(p.productId, slideIds, scope);
    if (scanId !== staleScanId) return;
    setStaleCount(stale.length);
  }

  createEffect(() => {
    const scope = p.scope;
    const slideIds = [...p.slideIds];
    // Every slide's own version: a save on any slide re-runs the walk.
    for (const id of slideIds) void instanceState.lastUpdated.slides[id];
    if (!scope) {
      staleScanId++;
      setStaleCount(0);
      return;
    }
    void rescanStaleFigures({ runId: scope.runId, adminArea2: scope.adminArea2 }, slideIds);
  });

  async function updateAllFigures() {
    const scope = p.scope;
    const context = p.authoringContext;
    if (!scope || !context) return;
    setUpdatingFigures(true);
    const result = await updateAllDeckFigures(
      p.productId,
      [...p.slideIds],
      { runId: scope.runId, adminArea2: scope.adminArea2 },
      context,
    );
    await rescanStaleFigures(scope, [...p.slideIds]);
    setUpdatingFigures(false);
    if (result.failures.length > 0) {
      await openAlert({
        text: result.failures.map((f) => f.reason).join("\n"),
        intent: "danger",
      });
    }
  }

  const canEditFigures = () => canEditProduct(p.productId);

  // The only cross-product figure reuse there is (D3): copy whole slides, with
  // their bundles verbatim. Enabled only with a selection.
  async function copyToDeck() {
    const slideIds = Array.from(selectedIds());
    if (slideIds.length === 0) return;
    const res = await openComponent({
      element: CopySlidesToDeckModal,
      props: { sourceProductId: p.productId, slideIds },
    });
    if (!res) return;
    clearSelection();
    await openAlert({
      text: t3({
        en: `Copied ${res.newSlideIds.length} slide(s).`,
        fr: `${res.newSlideIds.length} diapositive(s) copiée(s).`,
        pt: `${res.newSlideIds.length} diapositivo(s) copiado(s).`,
      }),
      intent: "success",
    });
  }

  const menuItems = (): MenuItem[] => [
    {
      label: t3({
        en: "Package, scope and folder",
        fr: "Paquet, portée et dossier",
        pt: "Pacote, âmbito e pasta",
      }),
      icon: "package",
      onClick: () => p.handleOpenProductSettings(),
    },
    {
      label: t3(TC.download),
      icon: "download",
      onClick: () => p.download(),
    },
    {
      label: t3({ en: "Share", fr: "Partager", pt: "Partilhar" }),
      icon: "arrowRight",
      onClick: () => p.share(),
    },
    {
      label:
        selectedIds().size > 0
          ? t3({
              en: `Copy ${selectedIds().size} slide(s) to deck…`,
              fr: `Copier ${selectedIds().size} diapositive(s) vers une présentation…`,
              pt: `Copiar ${selectedIds().size} diapositivo(s) para apresentação…`,
            })
          : t3({
              en: "Copy to deck…",
              fr: "Copier vers une présentation…",
              pt: "Copiar para apresentação…",
            }),
      icon: "copy",
      disabled: selectedIds().size === 0,
      onClick: () => void copyToDeck(),
    },
    {
      label: t3({ en: "Version history", fr: "Historique des versions", pt: "Histórico de versões" }),
      icon: "rotate",
      onClick: () => p.openVersionHistory(),
    },
    // { type: "divider" },
    // {
    //   label: "Batch edit visualizations",
    //   icon: "pencil",
    //   onClick: () => {},
    // },
  ];

  return (
    <FrameTop
      panelChildren={
        <div class="h-full w-full" data-cursor-zone="header">
        <HeadingBar
          data-tour="deck-toolbar"
          heading={p.deckLabel}
          onBack={() => p.handleClose()}
        >
          <div class="ui-gap-sm flex items-center">
            <ProductScopeBadge product={p.product} />
            <PresenceAvatars
              peers={otherPeers().filter((pe) => pe.deckId === p.productId)}
            />
            <Show when={p.slideIds.length > 0}>
              <div class="w-32">
                <Slider
                  data-tour="deck-slide-size"
                  value={slideSize()}
                  onChange={setSlideSize}
                  min={200}
                  max={800}
                  step={50}
                  fullWidth
                  disabled={isFillWidth()}
                />
              </div>
              <Button
                iconName={isFillWidth() ? "minimize" : "maximize"}
                outline
                onClick={() => setIsFillWidth(!isFillWidth())}
              />
              <Button
                id="deck-present-button"
                iconName="presentation"
                onClick={() => p.present()}
              >
                {t3({ en: "Present", fr: "Présenter", pt: "Apresentar" })}
              </Button>
            </Show>
            <Show when={canEditFigures()}>
              <UpdateAllFiguresButton
                count={staleCount()}
                busy={updatingFigures()}
                onClick={() => void updateAllFigures()}
              />
            </Show>
            <MenuTriggerWrapper position="bottom-end" items={addSlideMenuItems}>
              <Button id="deck-add-slide-button" iconName="plus">
                {t3({ en: "Add slide", fr: "Ajouter une diapositive", pt: "Adicionar diapositivo" })}
              </Button>
            </MenuTriggerWrapper>
            <Button
              id="deck-settings-button"
              iconName="settings"
              outline
              onClick={() => p.handleOpenSettings()}
            >
              {t3(TC.settings)}
            </Button>
            <MenuTriggerWrapper position="bottom-end" items={menuItems}>
              <Button id="deck-more-button" iconName="moreVertical" outline />
            </MenuTriggerWrapper>
            <Show when={!showAi()}>
              <Button
                onClick={() => setShowAi(true)}
                iconName="chevronLeft"
                outline
              >
                {t3({ en: "AI", fr: "IA", pt: "IA" })}
              </Button>
            </Show>
          </div>
        </HeadingBar>
        </div>
      }
    >
      <div
        class="ui-pad bg-base-200 h-full w-full overflow-auto"
        onClick={(e) => {
          // Clear selection when clicking outside slide cards
          const target = e.target as HTMLElement;
          const clickedOnSlide = target.closest(".slide-card-wrapper");
          if (!clickedOnSlide) {
            clearSelection();
          }
        }}
      >
        <Show when={p.isLoading}>
          <LoadingIndicator
            msg={t3({
              en: "Loading slides...",
              fr: "Chargement des diapositives...",
              pt: "A carregar diapositivos...",
            })}
            noPad
          />
        </Show>
        <Show when={!p.isLoading && p.slideIds.length === 0}>
          <div class="text-base-content-muted w-full py-16 text-center">
            {t3({
              en: 'No slides yet. Ask the AI to create some slides, or click "+ Add slide" to create your own',
              fr: "Aucune diapositive. Demandez à l'IA de créer des diapositives, ou cliquez sur « + Ajouter une diapositive » pour en créer vous-même",
              pt: 'Ainda não há diapositivos. Peça à IA para criar alguns diapositivos ou clique em "+ Adicionar diapositivo" para criar os seus',
            })}
          </div>
        </Show>
        <Show when={!p.isLoading && p.slideIds.length > 0}>
          {/* Wrapper exists so a tour can spotlight just the slides; the
              scroll container above is full-height, which leaves a tour
              popover nowhere to sit. */}
          <div data-tour="deck-grid">
          <SortableVendor
            idField="id"
            items={sortableSlideItems()}
            setItems={(newItems: { id: string }[]) => {
              const oldItems = sortableSlideItems();
              setSortableSlideItems(newItems);
              handleReorder(
                oldItems.map((i) => i.id),
                newItems.map((i) => i.id),
              );
            }}
            class="flex flex-wrap justify-center gap-4"
            multiDrag
            avoidImplicitDeselect
            selectedClass="sortable-selected"
            animation={150}
            ghostClass="opacity-50"
            chosenClass="shadow-floating"
            dragClass="cursor-grabbing"
            fallbackTolerance={3}
          >
            {(item: { id: string }) => {
              const index = () =>
                sortableSlideItems().findIndex((i) => i.id === item.id);
              return (
                <SlideCard
                  productId={p.productId}
                  slideId={item.id}
                  index={index()}
                  isSelected={selectedIds().has(item.id)}
                  selectedCount={selectedIds().size}
                  slideSize={slideSize()}
                  fillWidth={isFillWidth()}
                  onCardClick={(e, isCircleClick) =>
                    handleSlideClick(index(), item.id, e, isCircleClick)
                  }
                  onEdit={() => {
                    clearSelection();
                    p.onEditSlide(item.id);
                  }}
                  onDelete={() => handleDelete(item.id)}
                  onDuplicate={() => handleDuplicate(item.id)}
                  deckConfig={p.deckConfig}
                  viewers={otherPeers().filter((pe) => pe.slideId === item.id)}
                />
              );
            }}
          </SortableVendor>
          </div>
        </Show>
      </div>
    </FrameTop>
  );
}
