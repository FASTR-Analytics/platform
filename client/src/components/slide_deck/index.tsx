import {
  type PackageScope,
  type ProductSummary,
  type RunAuthoringContext,
  type SlideDeckConfig,
  getStartingConfigForSlideDeck,
  productScope,
  t3,
} from "lib";
import { instanceState, productById } from "~/state/instance/t1_store";
import {
  AIToolFailure,
  EditorComponentProps,
  getEditorWrapper,
  openComponent,
} from "panther";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { serverActions } from "~/server_actions";
import { getSlideFromCacheOrFetch } from "~/state/products/t2_slides";
import { getSlideDeckDetailFromCacheOrFetch } from "~/state/products/t2_slide_deck_detail";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import { DownloadSlideDeck } from "./download_slide_deck";
import { ShareSlideDeck } from "./share_slide_deck";
import { SlideEditor } from "./slide_editor";
import { SlideList } from "./slide_list";
import { SlidePresenter } from "./slide_presenter";
import {
  SlideDeckSettings,
  type SlideDeckSettingsProps,
} from "./slide_deck_settings";
import {
  copilotViewController,
  restoreCopilotView,
  type CopilotViewState,
} from "../copilot/ai_views";
import { snapshotForSlideEditor } from "~/components/_editor_snapshot";
import { pendingSlideOpen, setPendingSlideOpen } from "~/state/t4_ui";
import { setCollabAvatar, setCollabView } from "~/state/instance/collab";
import { clerk } from "~/components/LoggedInWrapper";
import { VersionHistoryEditor } from "../version_history";
import { ProductSettings } from "~/components/products/product_settings";

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
  // The copilot's env resolver needs a pair, not an optional one; the row is
  // gone only when the product was deleted, and the effect below closes the
  // editor on that.
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
    else copilotViewController.setView("viewing_products");
    setCollabView({});
  });

  createEffect(() => {
    const row = product();
    const loading = isLoading();
    if (row === undefined && !loading) p.close(undefined);
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
        copilotViewController.setView(
          "editing_slide_deck",
          { deckId: p.productId, deckLabel: deckLabel() },
          {
            // The pair is read LIVE, so a reattach or scope change mid-edit
            // moves the copilot's env with the editor (D15).
            getScope: () => requireScope(),
            getDeckConfig: () => deckConfig(),
            getSlideIds: () => slideIds(),
            getSelectedSlideIds: () => selectedSlideIds(),
          },
        );
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
  handleClose: () => Promise<void>;
}) {
  const { openEditor, EditorWrapper } = getEditorWrapper();
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

  async function handleEditSlide(slideId: string) {
    const scope = p.scope;
    const authoringContext = p.authoringContext;
    if (!scope || !authoringContext) return;

    const res = await getSlideFromCacheOrFetch(p.productId, slideId);
    if (!res.success) return;

    await openEditor({
      element: SlideEditor,
      props: {
        productId: p.productId,
        deckLabel: p.deckLabel,
        slideId,
        lastUpdated: res.data.lastUpdated,
        slide: res.data.slide,
        scope,
        authoringContext,
        returnToContext: copilotViewController.current(),
        ...snapshotForSlideEditor({ deckConfig: p.deckConfig }),
      },
    });
  }

  // Tour catalogue replay: once the deck has loaded, open its first slide of
  // the requested type. Cleared before opening (handleEditSlide only resolves
  // when the slide editor closes); if no slide matches, nothing opens and the
  // waiting tour times out quietly.
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
          void handleEditSlide(slideId);
          return;
        }
      }
    })();
  });

  return (
    <HistoryEditorWrapper>
      <SettingsEditorWrapper>
        <EditorWrapper>
          <SlideList
            productId={p.productId}
            product={p.product}
            scope={p.scope}
            authoringContext={p.authoringContext}
            slideIds={p.slideIds}
            isLoading={p.isLoading}
            setSelectedSlideIds={p.setSelectedSlideIds}
            onEditSlide={handleEditSlide}
            deckLabel={p.deckLabel}
            handleClose={p.handleClose}
            handleOpenSettings={handleOpenSettings}
            handleOpenProductSettings={handleOpenProductSettings}
            download={download}
            share={share}
            present={present}
            openVersionHistory={openVersionHistory}
            deckConfig={p.deckConfig}
          />
        </EditorWrapper>
      </SettingsEditorWrapper>
    </HistoryEditorWrapper>
  );
}
