import { SLIDE_DECK_THEMES, t3, type SlideDeckConfig, type SlideDeckTheme } from "lib";
import { type AlertComponentProps, ModalContainer } from "panther";
import { createSignal, For } from "solid-js";
import { ContentSlideMiniPreview } from "./style_preview.tsx";
import { slideDeckThemeCaption, slideDeckThemeLabel } from "./theme_labels.ts";

// A new deck's theme, asked the first time it is opened
// (config.themeChosen === false), as a new report is asked for its FASTR
// theme (report/theme_modal.tsx). After that the theme lives in the Deck menu.
// The modal only picks: the caller writes the choice through the same config
// patch the Deck menu uses, so there is one save path for a deck's look.
//
// Cancel leaves `themeChosen: false`, so the next open asks again, exactly as
// the report modal does.

type Props = AlertComponentProps<
  {
    deckLabel: string;
    // The deck as it stands, so each tile previews THIS deck's footer under
    // the candidate theme, and the modal opens on the theme it already has.
    config: SlideDeckConfig;
  },
  SlideDeckTheme
>;

export function SlideDeckThemeModal(p: Props) {
  const [selected, setSelected] = createSignal<SlideDeckTheme>(p.config.theme);

  return (
    <ModalContainer
      width="2xl"
      title={t3({
        en: `Choose a theme for “${p.deckLabel}”`,
        fr: `Choisissez un thème pour « ${p.deckLabel} »`,
        pt: `Escolha um tema para “${p.deckLabel}”`,
      })}
      onCancel={() => p.close(undefined)}
      actions={[{
        label: t3({ en: "Apply theme", fr: "Appliquer le thème", pt: "Aplicar tema" }),
        onClick: () => p.close(selected()),
        iconName: "check" as const,
        intent: "success" as const,
      }]}
    >
      <div class="ui-spy-sm">
        <div class="text-base-content-muted text-sm">
          {t3({
            en: "The theme sets the deck's colours, type and page furniture. You can change it again at any time from the Deck menu.",
            fr: "Le thème définit les couleurs, la typographie et la mise en page de la présentation. Vous pouvez en changer à tout moment depuis le menu Présentation.",
            pt: "O tema define as cores, a tipografia e os elementos de página da apresentação. Pode alterá-lo a qualquer momento no menu Apresentação.",
          })}
        </div>
        <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
          <For each={SLIDE_DECK_THEMES}>
            {(theme) => (
              <button
                type="button"
                class="ui-focusable group rounded-md p-1.5 text-left"
                classList={{
                  "ring-primary ring-2": selected() === theme,
                  "hover:bg-base-200": selected() !== theme,
                }}
                onClick={() => setSelected(theme)}
                onDblClick={() => p.close(theme)}
              >
                <div class="relative aspect-video overflow-hidden rounded border">
                  <ContentSlideMiniPreview config={{ ...p.config, theme }} />
                </div>
                <div class="text-base-content font-700 mt-1.5">
                  {slideDeckThemeLabel(theme)}
                </div>
                <div class="text-base-content-muted text-xs leading-snug">
                  {slideDeckThemeCaption(theme)}
                </div>
              </button>
            )}
          </For>
        </div>
      </div>
    </ModalContainer>
  );
}
