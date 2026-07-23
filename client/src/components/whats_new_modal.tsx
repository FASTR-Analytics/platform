import {
  compareDottedVersions,
  getLanguage,
  t3,
  WHATS_NEW_LAYOUTS,
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
import { For, Index, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";

const REDUCED_MOTION = typeof globalThis.matchMedia === "function" &&
  globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;

export type WhatsNewModalOutcome = "skipped" | "completed";

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
  const page = () => pages()[pageIndex()];
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

  return (
    <ModalContainer
      width="lg"
      scroll="content"
      topPanel={<div class="font-700 text-base-content text-xl">{rt(p.post.title)}</div>}
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
              <Button intent="primary" onClick={() => p.close("completed")}>
                {t3({ en: "Done", fr: "Terminé", pt: "Concluído" })}
              </Button>
            }
          >
            <Button intent="primary" iconName="chevronRight" onClick={next} />
          </Show>,
        ]
      }
    >
      {/* Fixed height so the modal doesn't resize as pages change; long
          pages scroll inside this region */}
      <div class="h-[min(600px,60vh)] overflow-y-auto">
        <Show when={page()}>
          {(pg) => <WhatsNewPageContent page={pg()} />}
        </Show>
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

function WhatsNewPageContent(p: { page: WhatsNewPage }) {
  const layout = () => layoutOf(p.page);
  const showImage = () => layout().hasImage && !!p.page.imageUrl;

  return (
    <Show
      when={layout().cover && showImage()}
      fallback={
        <div class="ui-spy">
          <Show when={rt(p.page.title)}>
            <h3 class="font-700 text-base-content text-lg">{rt(p.page.title)}</h3>
          </Show>
          <div classList={{ "ui-spy": !layout().row, "flex items-start gap-6": layout().row }}>
            <Show when={showImage() && layout().imageFirst}>
              <WhatsNewImage
                src={p.page.imageUrl!}
                alt={rt(p.page.imageAlt)}
                wrapClass={layout().row ? "shrink-0 rounded" : "mx-auto rounded"}
                imgClass="w-full rounded object-contain"
                width={`${layout().widthPct}%`}
              />
            </Show>
            <div class="min-w-0 grow">
              <MarkdownPresentationJsx markdown={rt(p.page.body)} />
            </div>
            <Show when={showImage() && !layout().imageFirst}>
              <WhatsNewImage
                src={p.page.imageUrl!}
                alt={rt(p.page.imageAlt)}
                wrapClass={layout().row ? "shrink-0 rounded" : "mx-auto rounded"}
                imgClass="w-full rounded object-contain"
                width={`${layout().widthPct}%`}
              />
            </Show>
          </div>
        </div>
      }
    >
      <div class="relative h-full overflow-hidden rounded">
        <WhatsNewImage
          src={p.page.imageUrl!}
          alt={rt(p.page.imageAlt)}
          wrapClass="absolute inset-0 h-full w-full"
          imgClass="h-full w-full object-cover"
        />
        <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-6 pt-16 text-white">
          <Show when={rt(p.page.title)}>
            <h3 class="font-700 mb-2 text-xl">{rt(p.page.title)}</h3>
          </Show>
          <MarkdownPresentationJsx markdown={rt(p.page.body)} />
        </div>
      </div>
    </Show>
  );
}

// Accessible image: alt text, hides itself on load failure, and under
// prefers-reduced-motion renders a GIF's first frame on a canvas (an <img>
// draws only frame 1; pixels are never read back, so cross-origin taint is
// irrelevant) with a play button to opt back into the animation.
function WhatsNewImage(p: {
  src: string;
  alt: string;
  wrapClass: string;
  imgClass: string;
  width?: string;
}) {
  const [failed, setFailed] = createSignal(false);
  const [play, setPlay] = createSignal(false);
  const staticFrame = () => REDUCED_MOTION && /\.gif(\?|$)/i.test(p.src) && !play();
  let canvasRef: HTMLCanvasElement | undefined;

  createEffect(() => {
    if (!staticFrame()) {
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
    };
    img.onerror = () => setFailed(true);
    img.src = p.src;
  });

  return (
    <Show when={!failed()}>
      <Show
        when={staticFrame()}
        fallback={
          <img
            src={p.src}
            alt={p.alt}
            class={`${p.wrapClass} ${p.imgClass}`}
            style={p.width ? { width: p.width } : undefined}
            onError={() => setFailed(true)}
          />
        }
      >
        <div
          class={`relative ${p.wrapClass}`}
          style={p.width ? { width: p.width } : undefined}
        >
          <canvas ref={canvasRef} class={p.imgClass} role="img" aria-label={p.alt} />
          <button
            type="button"
            class="absolute inset-0 m-auto flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white"
            title={t3({ en: "Play animation", fr: "Lire l'animation", pt: "Reproduzir animação" })}
            onClick={() => setPlay(true)}
          >
            ▶
          </button>
        </div>
      </Show>
    </Show>
  );
}

// Browsable history of announcements, newest first. Closes with the chosen
// post (caller opens WhatsNewModal for it) or undefined on Close.
export function WhatsNewFeedModal(
  p: AlertComponentProps<{ posts: WhatsNewPost[] }, WhatsNewPost | undefined>,
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
              <div class="font-700 text-base-content">{rt(post.title)}</div>
              <div class="text-base-content-muted mt-1 text-sm">{metaLabel(post)}</div>
            </button>
          )}
        </For>
      </div>
    </ModalContainer>
  );
}

// Phosphor "bell" (regular, MIT — see panther/PHOSPHOR_LICENSE.txt); panther's
// icon set has no bell, and panther itself must not be modified from this repo.
export function WhatsNewBellIcon() {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" class="h-[1.25em] w-[1.25em]">
      <path d="M221.8,175.94C216.25,166.38,208,139.33,208,104a80,80,0,1,0-160,0c0,35.34-8.26,62.38-13.81,71.94A16,16,0,0,0,48,200H88.81a40,40,0,0,0,78.38,0H208a16,16,0,0,0,13.8-24.06ZM128,216a24,24,0,0,1-22.62-16h45.24A24,24,0,0,1,128,216ZM48,184c7.7-13.24,16-43.92,16-80a64,64,0,1,1,128,0c0,36.05,8.28,66.73,16,80Z" />
    </svg>
  );
}
