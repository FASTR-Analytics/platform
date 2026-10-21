import {
  canonicalJson,
  getStartingConfigForSlideDeck,
  isUntouchedDeck,
  type PackageScope,
  productScope,
  type ProductSummary,
  type ResolvedPackageScope,
  type RunAuthoringContext,
  type Slide,
  type SlideDeckConfig,
  t3,
} from "lib";
import { LoadingIndicator, openAlert } from "panther";
import {
  createResolvedScope,
  instanceState,
  productById,
} from "~/state/instance/t1_store";
import { addLastUpdatedListener } from "~/state/instance/t1_sse";
import {
  AIToolFailure,
  EditorComponentProps,
  getEditorWrapper,
  openComponent,
  type StateHolder,
  StateHolderWrapper,
} from "panther";
import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  Show,
  untrack,
} from "solid-js";
import { serverActions } from "~/server_actions";
import {
  getSlideFromCacheOrFetch,
  peekSlide,
} from "~/state/products/t2_slides";
import { getSlideDeckDetailFromCacheOrFetch } from "~/state/products/t2_slide_deck_detail";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import { DownloadSlideDeck } from "./download_slide_deck";
import { ShareSlideDeck } from "./share_slide_deck";
import { SlideEditor, type SlideEditorApi } from "./slide_editor/mod.ts";
import { SlideList } from "./slide_list";
import { SlidePresenter } from "./slide_presenter";
import { SlideDeckSettings, type SlideDeckSettingsProps } from "./settings";
import {
  copilotViewController,
  type EditingSlideDeckContext,
  holdCopilotView,
} from "~/components/instance/copilot/mod.ts";
import { snapshotForSlideEditor } from "./editor_snapshot";
import { pendingSlideOpen, setPendingSlideOpen } from "~/state/t4_ui";
import { setCollabAvatar, setCollabView } from "~/state/instance/collab";
import { clerk } from "~/state/_infra/clerk";
import { VersionHistoryEditor } from "~/components/products/_shared/version_history/mod.ts";
import {
  closeOrDiscardEmptyProduct,
  ProductSettings,
} from "~/components/products/_shared/mod.ts";

type Props = EditorComponentProps<{ productId: string }, undefined>;

// The deck editor takes ONE thing: the product id. Label, package and
// scope are read LIVE from the T1 products row, so a reattach or scope change
// (from this header's Settings entry, from the Products page, or by a
// collaborator) moves the deck's figure data and authoring context together
// and lights the stale badges without a remount. A deleted product closes
// the editor: its row leaves T1.
export function SlideDeckEditor(p: Props) {
  const product = (): ProductSummary | undefined => productById(p.productId);
  const scope = (): PackageScope | undefined => {
    const row = product();
    return row === undefined ? undefined : productScope(row);
  };
  const deckLabel = () => product()?.label ?? "";
  // The pair with its scope's definition hash, as the authoring context and
  // the copilot's package views read it. Write tools read it through the
  // view context, so a missing row (the product was deleted; the effect
  // below closes the editor) is a tool failure, not an optional value.
  const resolvedScope = createResolvedScope(scope);
  const requireScope = (): ResolvedPackageScope => {
    const s = resolvedScope();
    if (s === undefined) {
      throw new AIToolFailure("This product no longer exists.");
    }
    return s;
  };
  const getRunId = () => requireScope().runId;

  // The copilot's views: the deck holds the view it opened over, sets
  // `opening_product` now and `editing_slide_deck` once loaded; the hold
  // restores the covered view when the deck unmounts.
  holdCopilotView();
  copilotViewController.setView(
    "opening_product",
    { productId: p.productId },
    { getLabel: deckLabel, getScope: requireScope, getRunId },
  );

  async function handleClose() {
    await closeOrDiscardEmptyProduct({
      productId: p.productId,
      kind: "slide_deck",
      // The open slide is read from its draft, which may hold typing not yet
      // saved; any other slide from the cache the rail renders from.
      untouched: async () => {
        const ids = slideIds();
        if (ids.length > 1) return false;
        if (ids.length === 0) return isUntouchedDeck([]);
        const open = openSlide();
        if (open?.slideId === ids[0]) return isUntouchedDeck([open.getDraft()]);
        const res = await getSlideFromCacheOrFetch(p.productId, ids[0]);
        return res.success && isUntouchedDeck([res.data.slide]);
      },
      close: () => p.close(undefined),
    });
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
    // The copilot's digest of what changed under the user, from the instance
    // SSE side-channel: every slides-table row change (the interaction keeps
    // this deck's own) and this deck's row, which every slide write, rename,
    // reattach or scope change bumps. The AI's own writes mark their echo
    // keys, so they drop at drain.
    const removeListener = addLastUpdatedListener((tableName, ids) => {
      if (tableName === "slides") {
        for (const id of ids) {
          copilotViewController.notify("edited_slide", { slideId: id });
        }
        return;
      }
      if (tableName !== "products" || !ids.includes(p.productId)) return;
      const row = product();
      if (row === undefined) return;
      copilotViewController.notify("product_updated", {
        productId: p.productId,
        type: row.type,
        label: row.label,
      });
    });
    onCleanup(removeListener);
  });

  onCleanup(() => {
    setCollabView({});
  });

  createEffect(() => {
    const row = product();
    const loading = isLoading();
    if (row === undefined && !loading) p.close(undefined);
  });

  // Every deck-config change (the Deck menu, the first-open theme question) is
  // applied HERE at once, so the rail and the open slide show it on the
  // click, and saved behind it. The config lives on this component, above the
  // editor and the rail, which is why the optimism does too. A failed save
  // puts back what the server holds.
  let configSavesInFlight = 0;
  async function patchDeckConfig(patch: Partial<SlideDeckConfig>) {
    const before = deckConfig();
    const next = { ...before, ...patch };
    setDeckConfig(next);
    configSavesInFlight++;
    const res = await serverActions.updateSlideDeckConfig({
      product_id: p.productId,
      config: next,
    });
    configSavesInFlight--;
    if (res.success === false) {
      setDeckConfig(before);
      await openAlert({ text: res.err, intent: "danger" });
    }
  }

  // ── The open slide (Google Slides: the rail on the left, one slide open
  // beside it) ──────────────────────────────────────────────────────────────
  // The deck owns it: the rail opens and deletes slides, the editor beside
  // the rail is mounted for it, and the copilot reads and writes it. The
  // editor is mounted per open slide, keyed, so a switch is a cleanup (the
  // old slide's collab session closes, its draft flushed if collab was not
  // persisting) and a fresh mount. The slide's content is fetched here before
  // the mount.
  const [currentSlideId, setCurrentSlideId] = createSignal<
    string | undefined
  >();
  const [editorSlide, setEditorSlide] = createSignal<
    { slideId: string; slide: Slide; lastUpdated: string } | undefined
  >();
  const [editorLoading, setEditorLoading] = createSignal(false);
  const [openSlide, setOpenSlide] = createSignal<SlideEditorApi | undefined>();
  let editorFetchId = 0;

  // Settles the open slide's draft, then makes `slideId` the open one; false
  // when the user kept an unsaved draft instead.
  async function selectSlide(slideId: string | undefined): Promise<boolean> {
    if (slideId === currentSlideId()) return true;
    const open = openSlide();
    if (open !== undefined && !(await open.flush())) return false;
    // The outgoing editor goes NOW (its session closes synchronously), so a
    // delete that follows never reaches it as a fatal room close. When the
    // incoming slide is already in memory (the rail's cards render from the
    // same cache, so it usually is) the swap happens in this same tick:
    // otherwise the editor is gone for a frame or two, and the header's menu
    // row, its pill and the save dot - all portaled out of the editor - blink
    // out and back while the fetch resolves.
    const ready = slideId === undefined
      ? undefined
      : peekSlide(p.productId, slideId);
    setEditorSlide(
      ready && slideId !== undefined
        ? { slideId, slide: ready.slide, lastUpdated: ready.lastUpdated }
        : undefined,
    );
    setCurrentSlideId(slideId);
    return true;
  }

  // The deck's delete, for the rail and the copilot alike: the editor leaves
  // a deleted open slide for its neighbour BEFORE the request, or the
  // server's fatal close of the slide's room would reach it as an alert.
  async function deleteSlides(ids: string[]) {
    const current = currentSlideId();
    if (current !== undefined && ids.includes(current)) {
      if (!(await selectSlide(neighbourOf(slideIds(), ids)))) {
        return {
          success: false as const,
          err: t3({
            en: "Delete cancelled.",
            fr: "Suppression annulée.",
            pt: "Eliminação cancelada.",
          }),
        };
      }
    }
    return await serverActions.deleteSlides({
      product_id: p.productId,
      slideIds: ids,
    });
  }

  // The open slide follows the deck: the first slide when none is open, the
  // neighbour when the open one is gone.
  createEffect(
    on(slideIds, (ids, prev) => {
      const current = untrack(currentSlideId);
      if (ids.length === 0) {
        if (current !== undefined) void selectSlide(undefined);
        return;
      }
      if (current !== undefined && ids.includes(current)) return;
      const wasAt = current === undefined ? -1 : (prev ?? []).indexOf(current);
      const next = wasAt >= 0 ? ids[Math.min(wasAt, ids.length - 1)] : ids[0];
      void selectSlide(next);
    }),
  );

  // Fetch the open slide's content for the editor's mount. Only on a switch
  // (not on every SSE flip: the mounted editor syncs itself through collab),
  // and only once the scope and authoring context are in hand.
  createEffect(on(
    // The pair by its run id, not by object: the T1 row re-derives the scope
    // object on every product tick.
    () => [currentSlideId(), scope()?.runId, authoringContext()] as const,
    ([slideId, runId, context]) => {
      const fetchId = ++editorFetchId;
      if (slideId === undefined || runId === undefined || !context) {
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
        setEditorSlide({
          slideId,
          slide: res.data.slide,
          lastUpdated: res.data.lastUpdated,
        });
      })();
    },
  ));

  // The deck config the editor was mounted with: a change of substance (the
  // settings modal) remounts it, a refetch of the same config does not.
  // Key-order blind: the optimistic config (a spread of the old one) and the
  // server's (rebuilt in schema order) are the same deck, and must not
  // remount the editor a second time when the refetch lands.
  const deckConfigKey = createMemo(() => canonicalJson(deckConfig()));
  const editorMount = createMemo(
    () => {
      const es = editorSlide();
      return es === undefined
        ? undefined
        : { ...es, key: `${es.slideId}|${deckConfigKey()}` };
    },
    undefined,
    { equals: (a, b) => a?.key === b?.key },
  );

  // Tour catalogue replay: once the deck has loaded, open its first slide of
  // the requested type. Cleared before selecting; if no slide matches, nothing
  // changes and the waiting tour times out quietly.
  createEffect(() => {
    const wanted = pendingSlideOpen();
    if (!wanted || isLoading()) return;
    const ids = [...slideIds()];
    setPendingSlideOpen(null);
    void (async () => {
      for (const slideId of ids) {
        const res = await getSlideFromCacheOrFetch(p.productId, slideId);
        if (!res.success) continue;
        if (res.data.slide.type === wanted) {
          void selectSlide(slideId);
          return;
        }
      }
    })();
  });

  // The copilot's deck view, set once the deck has loaded. Read live: a
  // reattach moves the pair under the view, and the open slide is the view's
  // state, so a switch of slides is no move.
  const deckContext: EditingSlideDeckContext = {
    getScope: requireScope,
    getRunId,
    getDeckLabel: () => deckLabel(),
    getDeckConfig: () => deckConfig(),
    getSlideIds: () => slideIds(),
    getSelectedSlideIds: () => selectedSlideIds(),
    getOpenSlide: () => openSlide(),
    deleteSlides,
  };

  // A read that fails before the first success: the error replaces the
  // editor, nothing is written and the copilot stays on `opening_product`.
  // A later successful read runs as the first. Loading itself is `isLoading`,
  // shown by the rail under the deck's header, so this is ready or error;
  // `true` is the data because the wrapper's ready branch needs truthy data.
  const [loadState, setLoadState] = createSignal<StateHolder<true>>({
    status: "ready",
    data: true,
  });

  // Single fetch path: first run loads the deck (and sets the copilot view),
  // subsequent runs are SSE-driven refetches on version flips.
  let aiContextSet = false;
  createEffect(() => {
    void instanceState.lastUpdated.products[p.productId];
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    async function load() {
      const res = await getSlideDeckDetailFromCacheOrFetch(p.productId);
      if (controller.signal.aborted) return;
      if (!res.success) {
        if (!aiContextSet) setLoadState({ status: "error", err: res.err });
        return;
      }
      if (!aiContextSet) {
        aiContextSet = true;
        setLoadState({ status: "ready", data: true });
        copilotViewController.setView(
          "editing_slide_deck",
          { deckId: p.productId },
          deckContext,
        );
      }
      // One write: slides that arrive with a config (the cover the first
      // theme choice makes) must never render a frame under the old one.
      // While a config save of ours is in flight, the optimistic config
      // already IS what we sent, and a refetch landing mid-flight would
      // flick the deck back to an older value.
      batch(() => {
        setSlideIds(res.data.slideIds);
        if (configSavesInFlight === 0) setDeckConfig(res.data.config);
      });
      setIsLoading(false);
    }
    load();
  });

  // The authoring context follows the LIVE pair and its scope's definition: a
  // reattach, a scope change or an edit to the scope's module list swaps the
  // metric and preset catalogue the insert-figure wizard and the update
  // actions author against. Immutable by identity, so this is a cache hit
  // after the first read of any given package under a definition. The
  // previous context stands until the next lands: the open slide's editor
  // is mounted only with a context, so blanking it would unmount the editor
  // under an open figure modal, whose apply then has nowhere to write.
  createEffect(() => {
    const resolved = resolvedScope();
    if (resolved === undefined) {
      setAuthoringContext(undefined);
      return;
    }
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    void (async () => {
      const res = await getRunAuthoringContextFromCacheOrFetch(resolved);
      if (controller.signal.aborted || !res.success) return;
      setAuthoringContext(res.data);
    })();
  });

  return (
    <StateHolderWrapper
      state={loadState()}
      onErrorButton={{
        label: t3({ en: "Close", fr: "Fermer", pt: "Fechar" }),
        onClick: () => void handleClose(),
      }}
    >
      {() => (
        <SlideDeckEditorInner
          productId={p.productId}
          product={product()}
          scope={scope()}
          authoringContext={authoringContext()}
          deckLabel={deckLabel()}
          deckConfig={deckConfig()}
          patchDeckConfig={patchDeckConfig}
          slideIds={slideIds()}
          isLoading={isLoading()}
          setSelectedSlideIds={setSelectedSlideIds}
          currentSlideId={currentSlideId()}
          selectSlide={selectSlide}
          deleteSlides={deleteSlides}
          editorMount={editorMount()}
          editorLoading={editorLoading()}
          openSlide={openSlide()}
          onEditorApi={setOpenSlide}
          handleClose={handleClose}
        />
      )}
    </StateHolderWrapper>
  );
}

function SlideDeckEditorInner(p: {
  productId: string;
  product: ProductSummary | undefined;
  scope: PackageScope | undefined;
  authoringContext: RunAuthoringContext | undefined;
  deckLabel: string;
  deckConfig: SlideDeckConfig;
  patchDeckConfig: (patch: Partial<SlideDeckConfig>) => Promise<void>;
  slideIds: string[];
  isLoading: boolean;
  setSelectedSlideIds: (ids: string[]) => void;
  currentSlideId: string | undefined;
  selectSlide: (slideId: string | undefined) => Promise<boolean>;
  deleteSlides: EditingSlideDeckContext["deleteSlides"];
  // The open slide's editor mount, keyed by slide and deck config.
  editorMount:
    | { slideId: string; slide: Slide; lastUpdated: string }
    | undefined;
  editorLoading: boolean;
  // The mounted editor's handle, once it has reported one.
  openSlide: SlideEditorApi | undefined;
  onEditorApi: (api: SlideEditorApi | undefined) => void;
  handleClose: () => Promise<void>;
}) {
  const {
    openEditor: openSettingsEditor,
    EditorWrapper: SettingsEditorWrapper,
  } = getEditorWrapper();
  const { openEditor: openHistoryEditor, EditorWrapper: HistoryEditorWrapper } =
    getEditorWrapper();
  // Where the open slide's sub-editors go (the visualization editor): over the
  // whole deck, like Settings and History, not inside the slide pane.
  const { openEditor: openDeckEditor, EditorWrapper: DeckEditorWrapper } =
    getEditorWrapper();

  async function handleOpenSettings() {
    await openSettingsEditor<SlideDeckSettingsProps, "AFTER_DELETE">({
      element: SlideDeckSettings,
      props: {
        deckId: p.productId,
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

  // The ONE product settings surface: label, folder, package, scope.
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
        // Every approved user is a possible recipient.
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

  const [toolbarHost, setToolbarHost] = createSignal<HTMLDivElement>();
  const [menuRowHost, setMenuRowHost] = createSignal<HTMLDivElement>();
  const [statusHost, setStatusHost] = createSignal<HTMLDivElement>();

  return (
    <HistoryEditorWrapper>
      <SettingsEditorWrapper>
        <DeckEditorWrapper>
          <SlideList
            productId={p.productId}
            product={p.product}
            scope={p.scope}
            authoringContext={p.authoringContext}
            slideIds={p.slideIds}
            isLoading={p.isLoading}
            setSelectedSlideIds={p.setSelectedSlideIds}
            currentSlideId={p.currentSlideId}
            onSelectSlide={p.selectSlide}
            openSlide={p.openSlide}
            onDeleteSlides={p.deleteSlides}
            deckLabel={p.deckLabel}
            handleClose={p.handleClose}
            handleOpenSettings={handleOpenSettings}
            handleOpenProductSettings={handleOpenProductSettings}
            download={download}
            share={share}
            present={present}
            openVersionHistory={openVersionHistory}
            deckConfig={p.deckConfig}
            patchDeckConfig={p.patchDeckConfig}
            onToolbarHost={setToolbarHost}
            onMenuRowHost={setMenuRowHost}
            onStatusHost={setStatusHost}
          >
            <Show
              when={p.editorMount}
              keyed
              fallback={
                <Show when={p.editorLoading}>
                  <LoadingIndicator
                    msg={t3({
                      en: "Loading slide...",
                      fr: "Chargement de la diapositive...",
                      pt: "A carregar diapositivo...",
                    })}
                    pad="md"
                  />
                </Show>
              }
            >
              {(es) => (
                <SlideEditor
                  productId={p.productId}
                  slideId={es.slideId}
                  lastUpdated={es.lastUpdated}
                  slide={es.slide}
                  scope={p.scope!}
                  authoringContext={p.authoringContext!}
                  toolbarHost={toolbarHost()}
                  menuRowHost={menuRowHost()}
                  statusHost={statusHost()}
                  openHostEditor={openDeckEditor}
                  onApi={p.onEditorApi}
                  {...snapshotForSlideEditor({ deckConfig: p.deckConfig })}
                />
              )}
            </Show>
          </SlideList>
        </DeckEditorWrapper>
      </SettingsEditorWrapper>
    </HistoryEditorWrapper>
  );
}

// The slide to open once `gone` are deleted: the one after the last of them
// in `order`, else the one before the first, else none.
function neighbourOf(order: string[], gone: string[]): string | undefined {
  const isGone = (id: string) => gone.includes(id);
  const last = order.findLastIndex(isGone);
  if (last === -1) return undefined;
  return order.slice(last + 1).find((id) => !isGone(id)) ??
    order.slice(0, order.findIndex(isGone)).at(-1);
}
