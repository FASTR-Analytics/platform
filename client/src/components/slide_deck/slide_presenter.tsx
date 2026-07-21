import { PAGE_HEIGHT_DU, PAGE_WIDTH_DU, t3, type SlideDeckConfig } from "lib";
import {
  Button,
  EditorComponentProps,
  getQueryStateFromApiResponse,
  PageHolder,
  type PageInputs,
  type StateHolder,
} from "panther";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import { convertSlideToPageInputs } from "~/generate_slide_deck/convert_slide_to_page_inputs";
import { projectState } from "~/state/project/t1_store";
import { getSlideDeckDetailFromCacheOrFetch } from "~/state/project/t2_slide_decks";
import { getSlideFromCacheOrFetch } from "~/state/project/t2_slides";

type Props = EditorComponentProps<
  {
    projectId: string;
    deckId: string;
    slideIds: string[];
    deckConfig: SlideDeckConfig;
    startIndex?: number;
  },
  undefined
>;

const LOADING_MSG = t3({ en: "Loading...", fr: "Chargement...", pt: "A carregar..." });

// Fullscreen presentation of a slide deck: one slide at a time, click/keyboard
// navigation, neighbour preloading. Reuses the exact render pipeline that the
// thumbnail SlideCard uses (getSlideFromCacheOrFetch -> convertSlideToPageInputs
// -> PageHolder), so on-screen presentation matches thumbnails and exports.
export function SlidePresenter(p: Props) {
  let rootEl!: HTMLDivElement;

  // p.slideIds was snapshotted when the presenter opened; peers can add,
  // delete, or reorder slides while it is up, so the live list is refetched on
  // the deck's SSE bump below.
  const [slideIds, setSlideIds] = createSignal(p.slideIds);
  const total = () => slideIds().length;
  const clamp = (i: number) => Math.max(0, Math.min(total() - 1, i));

  const [currentIndex, setCurrentIndex] = createSignal(clamp(p.startIndex ?? 0));
  // Render cache, keyed by slide id (stable across reorders) and stamped with
  // the slide's lastUpdated at render time so peer edits evict the entry.
  type CachedPage = { state: StateHolder<PageInputs>; renderedAt: string | undefined };
  const [pages, setPages] = createSignal<Map<string, CachedPage>>(new Map());
  const [isFullscreen, setIsFullscreen] = createSignal(false);
  const [controlsVisible, setControlsVisible] = createSignal(true);

  const currentPage = () => {
    const id = slideIds()[currentIndex()];
    return id === undefined ? undefined : pages().get(id)?.state;
  };

  function setPage(id: string, state: StateHolder<PageInputs>, renderedAt: string | undefined) {
    setPages((prev) => {
      const next = new Map(prev);
      next.set(id, { state, renderedAt });
      return next;
    });
  }

  // Render slide i and cache the result. Marks the slot as loading before the
  // first await so concurrent preloads of the same index don't double-fetch.
  async function ensureLoaded(i: number) {
    const ids = slideIds();
    if (i < 0 || i >= ids.length) {
      return;
    }
    const id = ids[i];
    if (pages().has(id)) {
      return;
    }
    const renderedAt = projectState.lastUpdated.slides[id];
    setPage(id, { status: "loading", msg: LOADING_MSG }, renderedAt);

    const res = await getSlideFromCacheOrFetch(p.projectId, id);
    if (!res.success) {
      setPage(id, { status: "error", err: res.err }, renderedAt);
      return;
    }
    const renderRes = await convertSlideToPageInputs(p.projectId, res.data.slide, i, p.deckConfig);
    setPage(id, getQueryStateFromApiResponse(renderRes), renderedAt);
  }

  // Keep the current slide and its neighbours warm so navigation is instant.
  // Also tracks pages(), so entries evicted below reload while still in view.
  createEffect(() => {
    const i = currentIndex();
    void pages();
    ensureLoaded(i);
    ensureLoaded(i + 1);
    ensureLoaded(i - 1);
  });

  // Live co-editing: refetch the slide-id list when a peer changes the deck,
  // and clamp the index in case the deck shrank.
  createEffect(() => {
    const _bump = projectState.lastUpdated.slide_decks[p.deckId];
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    async function load() {
      const res = await getSlideDeckDetailFromCacheOrFetch(p.projectId, p.deckId);
      if (controller.signal.aborted || !res.success) {
        return;
      }
      setSlideIds(res.data.slideIds);
      setCurrentIndex((i) => clamp(i));
    }
    load();
  });

  // Evict cached renders whose slide has since been edited by a peer; the
  // preload effect above re-renders whichever evicted slides are still needed.
  createEffect(() => {
    const stale = [...pages()].filter(
      ([id, entry]) => projectState.lastUpdated.slides[id] !== entry.renderedAt,
    );
    if (stale.length === 0) {
      return;
    }
    setPages((prev) => {
      const next = new Map(prev);
      for (const [id] of stale) {
        next.delete(id);
      }
      return next;
    });
  });

  function goNext() {
    setCurrentIndex((i) => clamp(i + 1));
  }
  function goPrev() {
    setCurrentIndex((i) => clamp(i - 1));
  }

  let closed = false;
  function close() {
    if (closed) {
      return;
    }
    closed = true;
    p.close(undefined);
  }

  // Controls auto-hide while idle, like a real presenter.
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  function pokeControls() {
    setControlsVisible(true);
    if (hideTimer) {
      clearTimeout(hideTimer);
    }
    hideTimer = setTimeout(() => setControlsVisible(false), 2500);
  }

  async function enterFullscreen() {
    try {
      if (rootEl && !document.fullscreenElement) {
        await rootEl.requestFullscreen();
      }
    } catch {
      // Fullscreen can be refused (no gesture / disallowed); the fixed overlay
      // already covers the window, so just carry on.
    }
  }
  async function exitFullscreenIfNeeded() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  }
  // Set when the user exits fullscreen via the minimize toggle, so the
  // fullscreenchange handler keeps the (windowed) presenter open instead of
  // treating it as an Escape-style "back out completely".
  let toggledFullscreenOff = false;
  function toggleFullscreen() {
    if (document.fullscreenElement) {
      toggledFullscreenOff = true;
      exitFullscreenIfNeeded();
    } else {
      enterFullscreen();
    }
  }
  function handleFullscreenChange() {
    const fs = !!document.fullscreenElement;
    setIsFullscreen(fs);
    if (!fs) {
      // Exited fullscreen. If the user did it via Escape (or browser chrome),
      // that's a request to leave the presentation entirely — close it. Only a
      // deliberate minimize-toggle keeps us open in windowed mode.
      if (toggledFullscreenOff) {
        toggledFullscreenOff = false;
      } else {
        close();
      }
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
      case "PageDown":
      case " ":
        e.preventDefault();
        goNext();
        break;
      case "ArrowLeft":
      case "ArrowUp":
      case "PageUp":
        e.preventDefault();
        goPrev();
        break;
      case "Home":
        e.preventDefault();
        setCurrentIndex(0);
        break;
      case "End":
        e.preventDefault();
        setCurrentIndex(total() - 1);
        break;
      case "Escape":
        // Back out completely on the first press. If we're in real fullscreen,
        // the browser also exits it; close() -> onCleanup handles that, and the
        // fullscreenchange handler closes us in the case the keydown never fires.
        e.preventDefault();
        close();
        break;
    }
    pokeControls();
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    enterFullscreen();
    pokeControls();
    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (hideTimer) {
        clearTimeout(hideTimer);
      }
      exitFullscreenIfNeeded();
    });
  });

  return (
    <div
      ref={rootEl!}
      class="fixed inset-0 z-50 flex select-none items-center justify-center bg-black"
      onClick={goNext}
      onPointerMove={pokeControls}
    >
      <Show
        when={total() > 0}
        fallback={
          <div class="text-base-100 text-sm">
            {t3({ en: "No slides to present", fr: "Aucune diapositive à présenter", pt: "Sem diapositivos para apresentar" })}
          </div>
        }
      >
        <div
          class="relative bg-white"
          style={{
            "aspect-ratio": `${PAGE_WIDTH_DU} / ${PAGE_HEIGHT_DU}`,
            width: `min(100vw, calc(100vh * ${PAGE_WIDTH_DU} / ${PAGE_HEIGHT_DU}))`,
          }}
        >
          <Show when={!currentPage() || currentPage()!.status === "loading"}>
            <div class="text-neutral flex h-full w-full items-center justify-center">
              <div class="text-sm">{LOADING_MSG}</div>
            </div>
          </Show>
          <Show when={currentPage()?.status === "error"}>
            <PageHolder
              pageInputs={undefined}
              pageWidthDu={PAGE_WIDTH_DU}
              pageHeightDu={PAGE_HEIGHT_DU}
              simpleError
              externalError={(currentPage() as { err: string }).err}
            />
          </Show>
          <Show when={currentPage()?.status === "ready"}>
            <PageHolder
              pageInputs={(currentPage() as { data: PageInputs }).data}
              pageWidthDu={PAGE_WIDTH_DU}
              pageHeightDu={PAGE_HEIGHT_DU}
              simpleError
            />
          </Show>
        </div>
      </Show>

      {/* Controls overlay: transparent to clicks except the button clusters. */}
      <div
        class="pointer-events-none absolute inset-0 transition-opacity duration-200"
        classList={{ "opacity-0": !controlsVisible(), "opacity-100": controlsVisible() }}
      >
        <div
          class="ui-gap-sm pointer-events-auto absolute right-4 top-4 flex items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            iconName={isFullscreen() ? "minimize" : "maximize"}
            outline
            onClick={toggleFullscreen}
          />
          <Button iconName="x" outline onClick={close} />
        </div>

        <Show when={total() > 0}>
          <div
            class="ui-gap pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center rounded-full bg-black/60 px-3 py-2"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              iconName="chevronLeft"
              outline
              disabled={currentIndex() === 0}
              onClick={goPrev}
            />
            <div class="text-base-100 min-w-16 text-center text-sm tabular-nums">
              {currentIndex() + 1} / {total()}
            </div>
            <Button
              iconName="chevronRight"
              outline
              disabled={currentIndex() === total() - 1}
              onClick={goNext}
            />
          </div>
        </Show>
      </div>
    </div>
  );
}
