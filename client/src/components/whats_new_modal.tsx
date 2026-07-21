import { t3, type WhatsNewPage, type WhatsNewPost } from "lib";
import {
  Button,
  MarkdownPresentationJsx,
  ModalContainer,
  type AlertComponentProps,
} from "panther";
import { Index, Show, createSignal } from "solid-js";

export function WhatsNewModal(p: AlertComponentProps<{ post: WhatsNewPost }, undefined>) {
  const [pageIndex, setPageIndex] = createSignal(0);
  const page = () => p.post.pages[pageIndex()];
  const isLast = () => pageIndex() === p.post.pages.length - 1;
  const multiPage = () => p.post.pages.length > 1;

  return (
    <ModalContainer
      width="lg"
      scroll="content"
      topPanel={<div class="font-700 text-base-content text-xl">{p.post.title}</div>}
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Show when={multiPage()}>
            <Button
              intent="neutral"
              disabled={pageIndex() === 0}
              onClick={() => setPageIndex((i) => i - 1)}
            >
              {t3({ en: "Back", fr: "Retour", pt: "Voltar" })}
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
          <Button
            intent="primary"
            onClick={() => (isLast() ? p.close(undefined) : setPageIndex((i) => i + 1))}
          >
            {isLast()
              ? t3({ en: "Done", fr: "Terminé", pt: "Concluído" })
              : t3({ en: "Next", fr: "Suivant", pt: "Seguinte" })}
          </Button>,
        ]
      }
    >
      <WhatsNewPageContent page={page()} />
    </ModalContainer>
  );
}

function WhatsNewPageContent(p: { page: WhatsNewPage }) {
  const pos = () => p.page.imagePosition ?? "top";
  const sideBySide = () => !!p.page.imageUrl && (pos() === "left" || pos() === "right");

  function img() {
    return (
      <img
        src={p.page.imageUrl}
        alt=""
        class="rounded object-contain"
        classList={{
          "w-full": !sideBySide(),
          "w-2/5 shrink-0": sideBySide(),
        }}
      />
    );
  }

  return (
    <div class="ui-spy">
      <Show when={p.page.title}>
        <h3 class="font-700 text-base-content text-lg">{p.page.title}</h3>
      </Show>
      <div classList={{ "ui-spy": !sideBySide(), "flex items-start gap-6": sideBySide() }}>
        <Show when={p.page.imageUrl && (pos() === "top" || pos() === "left")}>{img()}</Show>
        <div class="min-w-0 grow">
          <MarkdownPresentationJsx markdown={p.page.body} />
        </div>
        <Show when={p.page.imageUrl && (pos() === "bottom" || pos() === "right")}>{img()}</Show>
      </div>
    </div>
  );
}
