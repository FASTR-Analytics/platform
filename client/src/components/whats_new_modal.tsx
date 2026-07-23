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
import { For, Index, Show, createSignal } from "solid-js";

// Authored content in the viewer's current app language, English fallback
function rt(t: WhatsNewText | undefined): string {
  if (!t) {
    return "";
  }
  const v = t[getLanguage()];
  return v && v.trim() ? v : t.en;
}

export function WhatsNewModal(p: AlertComponentProps<{ post: WhatsNewPost }, undefined>) {
  const [pageIndex, setPageIndex] = createSignal(0);
  const page = () => p.post.pages[pageIndex()];
  const isLast = () => pageIndex() === p.post.pages.length - 1;
  const multiPage = () => p.post.pages.length > 1;

  return (
    <ModalContainer
      width="lg"
      scroll="content"
      topPanel={<div class="font-700 text-base-content text-xl">{rt(p.post.title)}</div>}
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Show when={multiPage() && !isLast()}>
            <Button intent="neutral" onClick={() => p.close(undefined)}>
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
              <Index each={p.post.pages}>
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
              onClick={() => setPageIndex((i) => i - 1)}
            />
          </Show>,
          <Show
            when={multiPage() && !isLast()}
            fallback={
              <Button intent="primary" onClick={() => p.close(undefined)}>
                {t3({ en: "Done", fr: "Terminé", pt: "Concluído" })}
              </Button>
            }
          >
            <Button
              intent="primary"
              iconName="chevronRight"
              onClick={() => setPageIndex((i) => i + 1)}
            />
          </Show>,
        ]
      }
    >
      {/* Fixed height so the modal doesn't resize as pages change; long
          pages scroll inside this region */}
      <div class="h-[min(600px,60vh)] overflow-y-auto">
        <WhatsNewPageContent page={page()} />
      </div>
    </ModalContainer>
  );
}

function WhatsNewPageContent(p: { page: WhatsNewPage }) {
  const layout = () => WHATS_NEW_LAYOUTS[p.page.layoutPreset] ?? WHATS_NEW_LAYOUTS.textOnly;
  const showImage = () => layout().hasImage && !!p.page.imageUrl;

  function img() {
    return (
      <img
        src={p.page.imageUrl}
        alt=""
        class="rounded object-contain"
        classList={{
          "mx-auto": !layout().row,
          "shrink-0": layout().row,
        }}
        style={{ width: `${layout().widthPct}%` }}
      />
    );
  }

  return (
    <div class="ui-spy">
      <Show when={p.page.title}>
        <h3 class="font-700 text-base-content text-lg">{rt(p.page.title)}</h3>
      </Show>
      <div classList={{ "ui-spy": !layout().row, "flex items-start gap-6": layout().row }}>
        <Show when={showImage() && layout().imageFirst}>{img()}</Show>
        <div class="min-w-0 grow">
          <MarkdownPresentationJsx markdown={rt(p.page.body)} />
        </div>
        <Show when={showImage() && !layout().imageFirst}>{img()}</Show>
      </div>
    </div>
  );
}

// Browsable history of announcements, newest first. Closes with the chosen
// post (caller opens WhatsNewModal for it) or undefined on Close.
export function WhatsNewFeedModal(
  p: AlertComponentProps<{ posts: WhatsNewPost[] }, WhatsNewPost | undefined>,
) {
  const sorted = () =>
    [...p.posts].sort((a, b) => compareDottedVersions(b.version, a.version));

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
              <div class="text-base-content-muted mt-1 text-sm">
                v{post.version} ·{" "}
                {new Date(post.updatedAt).toLocaleDateString(getLanguage())}
                {" · "}
                {post.pages.length}{" "}
                {post.pages.length === 1
                  ? t3({ en: "page", fr: "page", pt: "página" })
                  : t3({ en: "pages", fr: "pages", pt: "páginas" })}
              </div>
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
