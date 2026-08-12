import {
  compareDottedVersions,
  getLanguage,
  isWhatsNewVideo,
  isWhatsNewYouTube,
  t3,
  whatsNewYouTubeEmbedUrl,
  WHATS_NEW_LAYOUTS,
  whatsNewMediaWidthPct,
  type WhatsNewPage,
  type WhatsNewPost,
  type WhatsNewText,
} from "lib";
import {
  Button,
  MarkdownPresentationJsx,
  ModalContainer,
  type AlertComponentProps,
} from "panther";
import {
  For,
  Index,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";

const REDUCED_MOTION =
  typeof globalThis.matchMedia === "function" &&
  globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;

export type WhatsNewModalOutcome = "skipped" | "completed";

const QUEUE_ADVANCE_TIMEOUT_MS = 8_000;

// Authored content in the viewer's current app language, English fallback
function rt(t: WhatsNewText | undefined): string {
  if (!t) {
    return "";
  }
  const v = t[getLanguage()];
  return v && v.trim() ? v : (t.en ?? "");
}

export function WhatsNewModal(
  p: AlertComponentProps<{ post: WhatsNewPost }, WhatsNewModalOutcome>,
) {
  const pages = () => p.post.pages ?? [];
  const [pageIndex, setPageIndex] = createSignal(0);
  const isLast = () => pageIndex() >= pages().length - 1;
  const multiPage = () => pages().length > 1;

  function next() {
    if (!isLast()) setPageIndex((i) => i + 1);
  }
  function prev() {
    if (pageIndex() > 0) setPageIndex((i) => i - 1);
  }

  // Panther's modal system has no keyboard handling; the listener lives here
  // (same pattern as slide_presenter.tsx)
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    } else if (e.key === "Escape") {
      e.preventDefault();
      p.close(isLast() ? "completed" : "skipped");
    }
  }
  onMount(() => document.addEventListener("keydown", handleKeyDown));
  onCleanup(() => document.removeEventListener("keydown", handleKeyDown));

  // Every page stays mounted (hidden when inactive) so the element that
  // downloaded the media IS the element displayed — a detached prefetch
  // can't guarantee that, because browsers deprioritise offscreen media and
  // a cached 206 isn't reliably reused by a different element.
  // `loadUpTo` staggers it: a page only gets its src once the previous one
  // has finished, so the queue never competes with what's on screen.
  const [loadUpTo, setLoadUpTo] = createSignal(0);
  const allowLoad = (i: number) => setLoadUpTo((c) => Math.max(c, i));

  // Jumping ahead (dots/keyboard) must not wait behind the queue
  createEffect(() => allowLoad(pageIndex()));

  return (
    <ModalContainer
      width="lg"
      scroll="content"
      topPanel={
        <div class="font-700 text-base-content text-xl">{rt(p.post.title)}</div>
      }
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Show when={multiPage() && !isLast()}>
            <Button intent="neutral" onClick={() => p.close("skipped")}>
              {t3({ en: "Skip", fr: "Passer", pt: "Ignorar" })}
            </Button>
          </Show>,
        ]
      }
      rightButtons={
        // eslint-disable-next-line jsx-key
        [
          <Show when={multiPage()}>
            <div class="flex items-center gap-1.5 pr-2">
              <Index each={pages()}>
                {(_, i) => (
                  <div
                    class="h-1.5 w-1.5 rounded-full"
                    classList={{
                      "bg-primary": i === pageIndex(),
                      "bg-base-300": i !== pageIndex(),
                    }}
                  />
                )}
              </Index>
            </div>
          </Show>,
          <Show when={multiPage()}>
            <Button
              intent="neutral"
              iconName="chevronLeft"
              disabled={pageIndex() === 0}
              onClick={prev}
            />
          </Show>,
          <Show
            when={multiPage() && !isLast()}
            fallback={
              <Button
                intent="primary"
                iconName="x"
                ariaLabel={t3({ en: "Done", fr: "Terminé", pt: "Concluído" })}
                onClick={() => p.close("completed")}
              />
            }
          >
            <Button intent="primary" iconName="chevronRight" onClick={next} />
          </Show>,
        ]
      }
    >
      {/* Fixed height so the modal doesn't resize as pages change; long
          pages scroll inside their own layer. Inactive pages are `invisible`
          rather than `hidden`: visibility:hidden keeps them laid out and
          rendered, so their media loads normally, whereas display:none lets
          the browser deprioritise it. */}
      <div class="relative h-[min(600px,60vh)]">
        <Index each={pages()}>
          {(pg, i) => (
            <div
              class="absolute inset-0 overflow-y-auto"
              classList={{ "invisible pointer-events-none": i !== pageIndex() }}
            >
              <WhatsNewPageContent
                page={pg()}
                active={i === pageIndex()}
                canLoad={i <= loadUpTo()}
                onLoaded={() => allowLoad(i + 1)}
              />
            </div>
          )}
        </Index>
      </div>
    </ModalContainer>
  );
}

// Forward-compat: an unknown preset id from a newer admin site keeps the
// image (hero) rather than silently dropping it
function layoutOf(page: WhatsNewPage) {
  const l = WHATS_NEW_LAYOUTS[page.layoutPreset];
  if (l) return l;
  return page.imageUrl ? WHATS_NEW_LAYOUTS.heroTop : WHATS_NEW_LAYOUTS.textOnly;
}

function WhatsNewPageContent(p: {
  page: WhatsNewPage;
  active: boolean;
  canLoad: boolean;
  onLoaded: () => void;
}) {
  const layout = () => layoutOf(p.page);
  const showImage = () => layout().hasImage && !!p.page.imageUrl;

  // A text-only page has nothing to wait for — release the queue immediately
  onMount(() => {
    if (!showImage()) {
      p.onLoaded();
    }
  });

  return (
    <Show
      when={layout().cover && showImage()}
      fallback={
        <div class="ui-spy">
          <Show when={rt(p.page.title)}>
            <h3 class="font-700 text-base-content text-lg">
              {rt(p.page.title)}
            </h3>
          </Show>
          <div
            classList={{
              "ui-spy": !layout().row,
              "flex items-start gap-6": layout().row,
            }}
          >
            <Show when={showImage() && layout().imageFirst}>
              <WhatsNewMedia
                src={p.page.imageUrl!}
                wrapClass={
                  layout().row
                    ? "relative shrink-0 rounded"
                    : "relative mx-auto rounded"
                }
                imgClass="w-full rounded object-contain"
                width={`${whatsNewMediaWidthPct(p.page.layoutPreset, p.page.mediaSize)}%`}
                active={p.active}
                canLoad={p.canLoad}
                onLoaded={p.onLoaded}
              />
            </Show>
            <div class="min-w-0 grow">
              <MarkdownPresentationJsx markdown={rt(p.page.body)} />
            </div>
            <Show when={showImage() && !layout().imageFirst}>
              <WhatsNewMedia
                src={p.page.imageUrl!}
                wrapClass={
                  layout().row
                    ? "relative shrink-0 rounded"
                    : "relative mx-auto rounded"
                }
                imgClass="w-full rounded object-contain"
                width={`${whatsNewMediaWidthPct(p.page.layoutPreset, p.page.mediaSize)}%`}
                active={p.active}
                canLoad={p.canLoad}
                onLoaded={p.onLoaded}
              />
            </Show>
          </div>
        </div>
      }
    >
      <div class="relative h-full overflow-hidden rounded">
        <WhatsNewMedia
          src={p.page.imageUrl!}
          wrapClass="absolute inset-0 h-full w-full"
          imgClass="h-full w-full object-cover"
          active={p.active}
          canLoad={p.canLoad}
          onLoaded={p.onLoaded}
        />
        <div
          class="absolute inset-x-0 bottom-0 p-6 pt-16"
          style={{
            background:
              "linear-gradient(to top, rgb(0 0 0 / 0.75), transparent)",
            color: "#ffffff",
          }}
        >
          <Show when={rt(p.page.title)}>
            <h3 class="font-700 mb-2 text-xl">{rt(p.page.title)}</h3>
          </Show>
          <MarkdownPresentationJsx markdown={rt(p.page.body)} />
        </div>
      </div>
    </Show>
  );
}

// Post media (image, GIF or mp4): hides itself on load failure. Under
// prefers-reduced-motion a video doesn't autoplay (native controls let the
// user start it), and a GIF renders its first frame on a canvas (an <img>
// draws only frame 1; pixels are never read back, so cross-origin taint is
// irrelevant) with a play button to opt back into the animation.
function WhatsNewMedia(p: {
  src: string;
  wrapClass: string;
  imgClass: string;
  width?: string;
  active: boolean;
  canLoad: boolean;
  onLoaded: () => void;
}) {
  const [failed, setFailed] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);
  const [play, setPlay] = createSignal(false);
  const isVideo = () => isWhatsNewVideo(p.src);
  const youTubeUrl = () => whatsNewYouTubeEmbedUrl(p.src);
  // Held back until this page's turn in the load queue
  const src = () => (p.canLoad ? p.src : undefined);
  let videoRef: HTMLVideoElement | undefined;

  // Nothing of ours to download for an embed — release the queue at once so
  // later pages aren't held up waiting on a third-party player
  onMount(() => {
    if (isWhatsNewYouTube(p.src)) {
      setLoaded(true);
      p.onLoaded();
    }
  });

  function markLoaded() {
    setLoaded(true);
    p.onLoaded();
  }

  // The queue advances on this page's load event, so a file that stalls (or
  // an element that never reports) must not starve the pages behind it —
  // release the next page after a grace period regardless.
  createEffect(() => {
    if (!p.canLoad || loaded()) {
      return;
    }
    const timer = setTimeout(() => p.onLoaded(), QUEUE_ADVANCE_TIMEOUT_MS);
    onCleanup(() => clearTimeout(timer));
  });

  // Don't burn CPU decoding a looping clip on a hidden page
  createEffect(() => {
    if (!videoRef || !loaded()) {
      return;
    }
    if (p.active && !REDUCED_MOTION) {
      void videoRef.play().catch(() => {});
    } else {
      videoRef.pause();
    }
  });
  const staticFrame = () =>
    REDUCED_MOTION && !isVideo() && /\.gif(\?|$)/i.test(p.src) && !play();
  const fadeClass = "transition-opacity duration-200";
  const fadeState = () => ({ "opacity-0": !loaded(), "opacity-100": loaded() });
  let canvasRef: HTMLCanvasElement | undefined;

  createEffect(() => {
    if (!staticFrame() || !p.canLoad) {
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (!canvasRef) {
        return;
      }
      canvasRef.width = img.naturalWidth || 1;
      canvasRef.height = img.naturalHeight || 1;
      canvasRef.getContext("2d")?.drawImage(img, 0, 0);
      markLoaded();
    };
    img.onerror = () => {
      setFailed(true);
      p.onLoaded();
    };
    img.src = p.src;
  });

  return (
    <Show when={!failed()}>
      <div
        class={p.wrapClass}
        classList={{ "min-h-[10rem]": !loaded() }}
        style={p.width ? { width: p.width } : undefined}
      >
        {/* Quiet placeholder holds the slot so surrounding text never
            reflows; prefetching means it's usually a blink at most */}
        <Show when={!loaded()}>
          <div class="bg-base-200 absolute inset-0 rounded" />
        </Show>
        {/* The player is mounted only while its page is visible — every page
            stays in the DOM, and N background YouTube iframes would be a
            heavy, pointless load */}
        <Show
          when={!youTubeUrl()}
          fallback={
            <Show
              when={p.active}
              fallback={<div class="bg-base-200 aspect-video w-full rounded" />}
            >
              <iframe
                src={youTubeUrl()}
                class="aspect-video w-full rounded"
                title={t3({ en: "Video", fr: "Vidéo", pt: "Vídeo" })}
                allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
                allowfullscreen
              />
            </Show>
          }
        >
          {/* Video appears as soon as it has a frame — no opacity ramp; fading
            in a video's first frame reads as sluggish, and by the time the
            page is shown the clip is already buffered in this very element */}
          <Show
            when={!isVideo()}
            fallback={
              <video
                src={src()}
                class={p.imgClass}
                preload="auto"
                loop
                controls={REDUCED_MOTION}
                ref={(el) => {
                  videoRef = el;
                  el.muted = true;
                  el.playsInline = true;
                }}
                onLoadedData={markLoaded}
                onError={() => {
                  setFailed(true);
                  p.onLoaded();
                }}
              />
            }
          >
            <Show
              when={staticFrame()}
              fallback={
                <img
                  src={src()}
                  alt=""
                  class={`${p.imgClass} ${fadeClass}`}
                  classList={fadeState()}
                  onLoad={markLoaded}
                  onError={() => {
                    setFailed(true);
                    p.onLoaded();
                  }}
                />
              }
            >
              <canvas
                ref={canvasRef}
                class={`${p.imgClass} ${fadeClass}`}
                classList={fadeState()}
              />
              <button
                type="button"
                class="absolute inset-0 m-auto flex h-10 w-10 cursor-pointer items-center justify-center rounded-full"
                style={{ background: "rgb(0 0 0 / 0.6)", color: "#ffffff" }}
                title={t3({
                  en: "Play animation",
                  fr: "Lire l'animation",
                  pt: "Reproduzir animação",
                })}
                onClick={() => setPlay(true)}
              >
                ▶
              </button>
            </Show>
          </Show>
        </Show>
      </div>
    </Show>
  );
}

// Browsable history of announcements, newest first. Closes with the chosen
// post (caller opens WhatsNewModal for it) or undefined on Close.
export function WhatsNewFeedModal(
  p: AlertComponentProps<
    { posts: WhatsNewPost[]; readIds: Set<string> },
    WhatsNewPost | undefined
  >,
) {
  const sorted = () =>
    [...p.posts].sort((a, b) => compareDottedVersions(b.version, a.version));

  const metaLabel = (post: WhatsNewPost): string => {
    const parts: string[] = [`v${post.version}`];
    const d = new Date(post.updatedAt);
    if (!isNaN(d.getTime())) {
      parts.push(d.toLocaleDateString(getLanguage()));
    }
    const pageCount = post.pages?.length ?? 0;
    parts.push(
      `${pageCount} ${
        pageCount === 1
          ? t3({ en: "page", fr: "page", pt: "página" })
          : t3({ en: "pages", fr: "pages", pt: "páginas" })
      }`,
    );
    return parts.join(" · ");
  };

  return (
    <ModalContainer
      width="md"
      scroll="content"
      topPanel={
        <div class="font-700 text-base-content text-xl">
          {t3({ en: "What's New", fr: "Nouveautés", pt: "Novidades" })}
        </div>
      }
      rightButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button intent="neutral" onClick={() => p.close(undefined)}>
            {t3({ en: "Close", fr: "Fermer", pt: "Fechar" })}
          </Button>,
        ]
      }
    >
      <div class="ui-spy-sm">
        <For each={sorted()}>
          {(post) => (
            <button
              type="button"
              class="ui-hoverable-base-100 block w-full cursor-pointer rounded border px-4 py-3 text-left"
              onClick={() => p.close(post)}
            >
              <div class="flex items-center gap-2">
                <div class="font-700 text-base-content grow">
                  {rt(post.title)}
                </div>
                <Show when={!p.readIds.has(post.id)}>
                  <div
                    class="bg-warning h-2 w-2 shrink-0 rounded-full"
                    title={t3({ en: "Unread", fr: "Non lu", pt: "Não lido" })}
                  />
                </Show>
              </div>
              <div class="text-base-content-muted mt-1 text-sm">
                {metaLabel(post)}
              </div>
            </button>
          )}
        </For>
      </div>
    </ModalContainer>
  );
}
