import { t3 } from "lib";
import {
  Button,
  Icon,
  ModalContainer,
  SelectList,
  type IconName,
} from "panther";
import { Show, createSignal, type JSX } from "solid-js";

export type TourCategory = {
  id: string;
  heading: string;
  iconName: IconName;
};

// Presentation shell for the Tours modal: xl modal, category sidebar on the
// left, the selected category's tour rows on the right. Both the category list
// and each category's content come from the caller.
export function TourCatalogueFrame(p: {
  categories: TourCategory[];
  loading: boolean;
  loadingText: string;
  close: () => void;
  renderCategory: (categoryId: string) => JSX.Element;
}) {
  const [selectedCategory, setSelectedCategory] = createSignal<string>(
    p.categories[0]?.id ?? "",
  );
  return (
    <ModalContainer
      width="xl"
      scroll="content"
      topPanel={
        <div class="font-700 text-base-content text-xl">
          {t3({
            en: "Guided tours",
            fr: "Visites guidées",
            pt: "Visitas guiadas",
          })}
        </div>
      }
      rightButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button intent="neutral" onClick={() => p.close()}>
            {t3({ en: "Close", fr: "Fermer", pt: "Fechar" })}
          </Button>,
        ]
      }
    >
      <div class="flex h-[min(650px,65vh)] gap-4">
        <div class="w-52 flex-none overflow-y-auto border-r pr-4">
          <SelectList
            items={p.categories.map((c) => ({ id: c.id, label: c.heading }))}
            value={selectedCategory()}
            onChange={setSelectedCategory}
            renderItem={(item) => {
              const category = p.categories.find((c) => c.id === item.id);
              return (
                <div class="flex items-center gap-2">
                  <span class="inline-block w-5 flex-none">
                    <Icon iconName={category?.iconName ?? "report"} />
                  </span>
                  <span class="truncate">{category?.heading}</span>
                </div>
              );
            }}
            fullWidth
          />
        </div>
        <div class="flex-1 overflow-y-auto">
          <Show
            when={!p.loading}
            fallback={
              <div class="text-base-content-muted text-sm">{p.loadingText}</div>
            }
          >
            <div class="ui-spy-sm">{p.renderCategory(selectedCategory())}</div>
          </Show>
        </div>
      </div>
    </ModalContainer>
  );
}

// One tour row; the caller supplies seen/availability state, the reason shown
// when unavailable, and the Play handler.
export function TourRow(p: {
  label: string;
  description: string;
  seen: boolean;
  available: boolean;
  reason: string;
  onPlay: () => void;
}) {
  return (
    <div
      class="flex items-center gap-3 rounded border px-4 py-3"
      classList={{ "opacity-60": !p.available }}
    >
      <div class="min-w-0 flex-1">
        <div class="text-base-content flex items-center gap-2">
          <span class="font-700">{p.label}</span>
          <span class="text-base-content-muted rounded-full border px-2 py-0.5 text-xs whitespace-nowrap">
            {p.seen
              ? t3({ en: "Seen", fr: "Vue", pt: "Vista" })
              : t3({
                  en: "Not seen yet",
                  fr: "Pas encore vue",
                  pt: "Ainda não vista",
                })}
          </span>
        </div>
        <div class="text-base-content-muted mt-1 text-sm">{p.description}</div>
        <Show when={!p.available}>
          <div class="text-base-content-muted mt-1 text-sm italic">
            {p.reason}
          </div>
        </Show>
      </div>
      <Show when={p.available}>
        <Button size="sm" onClick={p.onPlay}>
          {t3({ en: "Play", fr: "Lancer", pt: "Reproduzir" })}
        </Button>
      </Show>
    </div>
  );
}
