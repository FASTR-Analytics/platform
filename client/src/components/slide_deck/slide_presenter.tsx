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

const LOADING_MSG = t3({ en: "Loading...", fr: "Chargement..." });

// Fullscreen presentation of a slide deck: one slide at a time, click/keyboard
// navigation, neighbour preloading. Reuses the exact render pipeline that the
// thumbnail SlideCard uses (getSlideFromCacheOrFetch -> convertSlideToPageInputs
// -> PageHolder), so on-screen presentation matches thumbnails and exports.
export function SlidePresenter(p: Props) {
  let rootEl!: HTMLDivElement;

  const total = p.slideIds.length;
  const clamp = (i: number) => Math.max(0, Math.min(total - 1, i));

  const [currentIndex, setCurrentIndex] = createSignal(clamp(p.startIndex ?? 0));
  const [pages, setPages] = createSignal<Map<number, StateHolder<PageInputs>>>(new Map());
  const [isFullscreen, setIsFullscreen] = createSignal(false);
  const [controlsVisible, setControlsVisible] = createSignal(true);

  const currentPage = () => pages().get(currentIndex());

  function setPage(i: number, state: StateHolder<PageInputs>) {
    setPages((prev) => {
      const next = new Map(prev);
      next.set(i, state);
      return next;
    });
  }

  // Render slide i and cache the result. Marks the slot as loading before the
  // first await so concurrent preloads of the same index don't double-fetch.
  async function ensureLoaded(i: number) {
    if (i < 0 || i >= total) return;
    if (pages().has(i)) return;
    setPage(i, { status: "loading", msg: LOADING_MSG });

    const res = await getSlideFromCacheOrFetch(p.projectId, p.slideIds[i]);
    if (!res.success) {
      setPage(i, { status: "error", err: res.err });
      return;
    }
    const renderRes = await convertSlideToPageInputs(p.projectId, res.data.slide, i, p.deckConfig);
    setPage(i, getQueryStateFromApiResponse(renderRes));
  }

  // Keep the current slide and its neighbours warm so navigation is instant.
  createEffect(() => {
    const i = currentIndex();
    ensureLoaded(i);
    ensureLoaded(i + 1);
    ensureLoaded(i - 1);
  });

  function goNext() {
    setCurrentIndex((i) => clamp(i + 1));
  }
  function goPrev() {
    setCurrentIndex((i) => clamp(i - 1));
  }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    p.close(undefined);
  }

  // Controls auto-hide while idle, like a real presenter.
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  function pokeControls() {
    setControlsVisible(true);
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => setControlsVisible(false), 2500);
  }

  async function enterFullscreen() {
    try {
      if (rootEl && !document.fullscreenElement) await rootEl.requestFullscreen();
    } catch {
      // Fullscreen can be refused (no gesture / disallowed); the fixed overlay
      // already covers the window, so just carry on.
    }
  }
  async function exitFullscreenIfNeeded() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
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
        setCurrentIndex(total - 1);
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
      if (hideTimer) clearTimeout(hideTimer);
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
        when={total > 0}
        fallback={
          <div class="text-base-100 text-sm">
            {t3({ en: "No slides to present", fr: "Aucune diapositive à présenter" })}
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

        <Show when={total > 0}>
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
              {currentIndex() + 1} / {total}
            </div>
            <Button
              iconName="chevronRight"
              outline
              disabled={currentIndex() === total - 1}
              onClick={goNext}
            />
          </div>
        </Show>
      </div>
    </div>
  );
}
