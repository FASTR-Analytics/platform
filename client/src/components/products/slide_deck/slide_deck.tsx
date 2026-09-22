import {
  type PackageScope,
  type ProductSummary,
  type RunAuthoringContext,
  type Slide,
  type SlideDeckConfig,
  getStartingConfigForSlideDeck,
  productScope,
  t3,
} from "lib";
import { LoadingIndicator } from "panther";
import { instanceState, productById } from "~/state/instance/t1_store";
import {
  AIToolFailure,
  EditorComponentProps,
  getEditorWrapper,
  openComponent,
} from "panther";
import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show, untrack } from "solid-js";
import { serverActions } from "~/server_actions";
import { getSlideFromCacheOrFetch } from "~/state/products/t2_slides";
import { getSlideDeckDetailFromCacheOrFetch } from "~/state/products/t2_slide_deck_detail";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import { DownloadSlideDeck } from "./download_slide_deck";
import { ShareSlideDeck } from "./share_slide_deck";
import { SlideEditor, type SlideEditorApi } from "./slide_editor/mod.ts";
import { SlideList } from "./slide_list";
import { SlidePresenter } from "./slide_presenter";
import {
  SlideDeckSettings,
  type SlideDeckSettingsProps,
} from "./settings";
import {
  copilotViewController,
  restoreCopilotView,
  type CopilotViewState,
} from "~/components/products/copilot/mod.ts";
import { snapshotForSlideEditor } from "./editor_snapshot";
import { pendingSlideOpen, setPendingSlideOpen } from "~/state/t4_ui";
import { setCollabAvatar, setCollabView } from "~/state/instance/collab";
import { clerk } from "~/state/_infra/clerk";
import { VersionHistoryEditor } from "~/components/products/_shared/version_history/mod.ts";
import { ProductSettings } from "~/components/products/_shared/mod.ts";

type Props = EditorComponentProps<
  { productId: string; returnToContext?: CopilotViewState },
  undefined
>;

// The deck editor takes ONE thing: the product id (D16). Label, package and
// scope are read LIVE from the T1 products row, so a reattach or scope change
// (from this header's Settings entry, from the Products page, or by a
// collaborator) moves the deck's figure data and authoring context together
// and lights the D4 stale badges without a remount. A deleted product closes
// the editor: its row leaves T1.
export function SlideDeckEditor(p: Props) {
  const product = (): ProductSummary | undefined => productById(p.productId);
  const scope = (): PackageScope | undefined => {
    const row = product();
    return row === undefined ? undefined : productScope(row);
  };
  const deckLabel = () => product()?.label ?? "";
  // Write tools read the pair through the view context, so a missing row (the
  // product was deleted; the effect below closes the editor) is a tool
  // failure, not an optional value.
  const requireScope = (): PackageScope => {
    const s = scope();
    if (s === undefined) {
      throw new AIToolFailure("This product no longer exists.");
    }
    return s;
  };

  async function handleClose() {
    p.close(undefined);
  }

  const [slideIds, setSlideIds] = createSignal<string[]>([]);
  const [isLoading, setIsLoading] = createSignal(true);
  const [selectedSlideIds, setSelectedSlideIds] = createSignal<string[]>([]);
  const [deckConfig, setDeckConfig] = createSignal<SlideDeckConfig>(
    getStartingConfigForSlideDeck(deckLabel()),
  );
  // The product run's authoring context: immutable T2, keyed by the LIVE
  // runId, so a reattach re-resolves it instead of reusing the old package's.
  const [authoringContext, setAuthoringContext] = createSignal<
    RunAuthoringContext | undefined
  >();

  // The collab socket is instance-wide and owned by the instance boundary.
  // Here we only advertise that this user is currently inside this product.
  onMount(() => {
    setCollabAvatar(clerk.user?.imageUrl);
    setCollabView({ deckId: p.productId });
  });

  onCleanup(() => {
    if (p.returnToContext) restoreCopilotView(p.returnToContext);
    else copilotViewController.clearView();
    setCollabView({});
  });

  createEffect(() => {
    const row = product();
    const loading = isLoading();
    if (row === undefined && !loading) p.close(undefined);
  });

  // The copilot's deck view: set once the deck has loaded, and what the
  // slide editor beside the rail returns to between slides. Read live: a
  // reattach remounts the copilot on the new pair, and the tools of that
  // mount see the same pair here (D15).
  const deckContext = {
    getScope: () => requireScope(),
    getDeckConfig: () => deckConfig(),
    getSlideIds: () => slideIds(),
    getSelectedSlideIds: () => selectedSlideIds(),
  };
  const deckViewState = (): CopilotViewState => ({
    id: "editing_slide_deck",
    params: { deckId: p.productId, deckLabel: deckLabel() },
    context: deckContext,
  });

  // Single fetch path: first run loads the deck (and then sets the copilot
  // view), subsequent runs are SSE-driven refetches on version flips.
  let aiContextSet = false;
  createEffect(() => {
    void instanceState.lastUpdated.products[p.productId];
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    async function load() {
      const res = await getSlideDeckDetailFromCacheOrFetch(p.productId);
      if (controller.signal.aborted) return;
      if (res.success) {
        setSlideIds(res.data.slideIds);
        setDeckConfig(res.data.config);
      }
      setIsLoading(false);
      if (!aiContextSet) {
        aiContextSet = true;
        restoreCopilotView(deckViewState());
      }
    }
    load();
  });

  // The authoring context follows the LIVE runId: a reattach swaps the whole
  // metric and preset catalogue the insert-figure wizard and the update
  // actions author against. Immutable by identity, so this is a cache hit
  // after the first read of any given package.
  createEffect(() => {
    const runId = scope()?.runId;
    setAuthoringContext(undefined);
    if (runId === undefined) return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    void (async () => {
      const res = await getRunAuthoringContextFromCacheOrFetch(runId);
      if (controller.signal.aborted || !res.success) return;
      setAuthoringContext(res.data);
    })();
  });

  return (
    <SlideDeckEditorInner
      productId={p.productId}
      product={product()}
      scope={scope()}
      authoringContext={authoringContext()}
      deckLabel={deckLabel()}
      deckConfig={deckConfig()}
      slideIds={slideIds()}
      isLoading={isLoading()}
      setSelectedSlideIds={setSelectedSlideIds}
      deckContext={deckContext}
      deckViewState={deckViewState}
      handleClose={handleClose}
    />
  );
}

function SlideDeckEditorInner(p: {
  productId: string;
  product: ProductSummary | undefined;
  scope: PackageScope | undefined;
  authoringContext: RunAuthoringContext | undefined;
  deckLabel: string;
  deckConfig: SlideDeckConfig;
  slideIds: string[];
  isLoading: boolean;
  setSelectedSlideIds: (ids: string[]) => void;
  deckContext: {
    getDeckConfig: () => SlideDeckConfig;
    getSlideIds: () => string[];
    getSelectedSlideIds: () => string[];
  };
  deckViewState: () => CopilotViewState;
  handleClose: () => Promise<void>;
}) {
  const {
    openEditor: openSettingsEditor,
    EditorWrapper: SettingsEditorWrapper,
  } = getEditorWrapper();
  const { openEditor: openHistoryEditor, EditorWrapper: HistoryEditorWrapper } =
    getEditorWrapper();

  async function handleOpenSettings() {
    await openSettingsEditor<SlideDeckSettingsProps, "AFTER_DELETE">({
      element: SlideDeckSettings,
      props: {
        config: p.deckConfig,
        heading: t3({
          en: "Slide deck settings",
          fr: "Paramètres de la présentation",
          pt: "Definições da apresentação",
        }),
        nameLabel: t3({
          en: "Slide deck name",
          fr: "Nom de la présentation",
          pt: "Nome da apresentação",
        }),
        showPageNumbersSuffix: t3({
          en: "(except on cover and section slides)",
          fr: "(sauf sur les diapositives de couverture et de section)",
          pt: "(exceto nos diapositivos de capa e de secção)",
        }),
        saveConfig: (config) =>
          serverActions.updateSlideDeckConfig({
            product_id: p.productId,
            config,
          }),
        onSaved: async () => {},
      },
    });
  }

  // The ONE product settings surface (D16): label, folder, package, scope.
  async function handleOpenProductSettings() {
    const product = p.product;
    if (!product) return;
    await openComponent({ element: ProductSettings, props: { product } });
  }

  async function download() {
    await openComponent({
      element: DownloadSlideDeck,
      props: { productId: p.productId },
    });
  }

  async function openVersionHistory() {
    await openHistoryEditor({
      element: VersionHistoryEditor,
      props: {
        kind: "deck" as const,
        docId: p.productId,
        currentLabel: p.deckLabel,
      },
    });
  }

  async function share() {
    await openComponent({
      element: ShareSlideDeck,
      props: {
        productId: p.productId,
        deckLabel: p.deckLabel,
        // Every approved user is a possible recipient (D2).
        userEmails: instanceState.users.map((u) => u.email),
      },
    });
  }

  async function present() {
    await openComponent({
      element: SlidePresenter,
      props: {
        productId: p.productId,
        slideIds: p.slideIds,
        deckConfig: p.deckConfig,
      },
    });
  }

  // ── The open slide (Google Slides: the rail on the left, one slide open
  // beside it) ──────────────────────────────────────────────────────────────
  // The editor is mounted per open slide, keyed, so a switch is a cleanup
  // (the old slide's collab session closes, its draft flushed if collab was
  // not persisting) and a fresh mount. The slide's content is fetched here
  // before the mount, as the full-page editor used to be handed it.
  const [currentSlideId, setCurrentSlideId] = createSignal<string | undefined>();
  const [editorSlide, setEditorSlide] = createSignal<
    { slideId: string; slide: Slide; lastUpdated: string } | undefined
  >();
  const [editorLoading, setEditorLoading] = createSignal(false);
  let editorApi: SlideEditorApi | undefined;
  let editorFetchId = 0;

  // Settles the open slide's draft, then makes `slideId` the open one; false
  // when the user kept an unsaved draft instead.
  async function selectSlide(slideId: string | undefined): Promise<boolean> {
    if (slideId === currentSlideId()) return true;
    if (editorApi !== undefined && !(await editorApi.flush())) return false;
    // Unmount the outgoing editor NOW (its session closes synchronously), so
    // a delete that follows never reaches it as a fatal room close.
    setEditorSlide(undefined);
    setCurrentSlideId(slideId);
    return true;
  }

  // The open slide follows the deck: the first slide when none is open, the
  // neighbour when the open one is gone.
  createEffect(
    on(
      () => p.slideIds,
      (slideIds, prev) => {
        const current = untrack(currentSlideId);
        if (slideIds.length === 0) {
          if (current !== undefined) void selectSlide(undefined);
          return;
        }
        if (current !== undefined && slideIds.includes(current)) return;
        const wasAt = current === undefined ? -1 : (prev ?? []).indexOf(current);
        const next = wasAt >= 0
          ? slideIds[Math.min(wasAt, slideIds.length - 1)]
          : slideIds[0];
        void selectSlide(next);
      },
    ),
  );

  // Fetch the open slide's content for the editor's mount. Only on a switch
  // (not on every SSE flip: the mounted editor syncs itself through collab),
  // and only once the scope and authoring context are in hand.
  createEffect(on(
    // The pair by its run id, not by object: the T1 row re-derives the scope
    // object on every product tick.
    () => [currentSlideId(), p.scope?.runId, p.authoringContext] as const,
    ([slideId, runId, authoringContext]) => {
    const fetchId = ++editorFetchId;
    if (slideId === undefined || runId === undefined || !authoringContext) {
      setEditorSlide(undefined);
      setEditorLoading(false);
      return;
    }
    setEditorLoading(true);
    void (async () => {
      const res = await getSlideFromCacheOrFetch(p.productId, slideId);
      if (fetchId !== editorFetchId) return;
      setEditorLoading(false);
      if (!res.success) {
        setEditorSlide(undefined);
        return;
      }
      setEditorSlide({ slideId, slide: res.data.slide, lastUpdated: res.data.lastUpdated });
    })();
  }));

  // The deck config the editor was mounted with: a change of substance (the
  // settings modal) remounts it, a refetch of the same config does not.
  const deckConfigKey = createMemo(() => JSON.stringify(p.deckConfig));
  const editorKey = createMemo(() => {
    const es = editorSlide();
    return es === undefined ? undefined : { ...es, key: `${es.slideId}|${deckConfigKey()}` };
  }, undefined, { equals: (a, b) => a?.key === b?.key });

  // Tour catalogue replay: once the deck has loaded, open its first slide of
  // the requested type. Cleared before selecting; if no slide matches, nothing
  // changes and the waiting tour times out quietly.
  createEffect(() => {
    const wanted = pendingSlideOpen();
    if (!wanted || p.isLoading) return;
    const slideIds = [...p.slideIds];
    setPendingSlideOpen(null);
    void (async () => {
      for (const slideId of slideIds) {
        const res = await getSlideFromCacheOrFetch(p.productId, slideId);
        if (!res.success) continue;
        if (res.data.slide.type === wanted) {
          void selectSlide(slideId);
          return;
        }
      }
    })();
  });

  return (
    <HistoryEditorWrapper>
      <SettingsEditorWrapper>
        <SlideList
          productId={p.productId}
          product={p.product}
          scope={p.scope}
          authoringContext={p.authoringContext}
          slideIds={p.slideIds}
          isLoading={p.isLoading}
          setSelectedSlideIds={p.setSelectedSlideIds}
          currentSlideId={currentSlideId()}
          onSelectSlide={selectSlide}
          deckLabel={p.deckLabel}
          handleClose={p.handleClose}
          handleOpenSettings={handleOpenSettings}
          handleOpenProductSettings={handleOpenProductSettings}
          download={download}
          share={share}
          present={present}
          openVersionHistory={openVersionHistory}
          deckConfig={p.deckConfig}
        >
          <Show
            when={editorKey()}
            keyed
            fallback={
              <Show when={editorLoading()}>
                <LoadingIndicator
                  msg={t3({ en: "Loading slide...", fr: "Chargement de la diapositive...", pt: "A carregar diapositivo..." })}
                />
              </Show>
            }
          >
            {(es) => (
              <SlideEditor
                productId={p.productId}
                deckLabel={p.deckLabel}
                slideId={es.slideId}
                lastUpdated={es.lastUpdated}
                slide={es.slide}
                scope={p.scope!}
                authoringContext={p.authoringContext!}
                returnToContext={p.deckViewState()}
                deckContext={p.deckContext}
                onApi={(api) => {
                  editorApi = api;
                }}
                {...snapshotForSlideEditor({ deckConfig: p.deckConfig })}
              />
            )}
          </Show>
        </SlideList>
      </SettingsEditorWrapper>
    </HistoryEditorWrapper>
  );
}
