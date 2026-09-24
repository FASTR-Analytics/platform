// The Deck menu: everything that applies to the WHOLE deck, in the header's
// menu row beside the slide's own menus. It is the report toolbar's Page menu,
// for decks. Each control saves as it is touched (there is no Save button
// here), so the canvas re-renders under the open menu.
//
// It is rendered by slide_list.tsx, NOT by the slide toolbar, on purpose: a
// deck-config change remounts the keyed slide editor (editor_snapshot.ts), so
// a menu living inside that editor would close on its own first click.

import { t3, type SlideDeckConfig } from "lib";
import { Button, Checkbox, getSelectOptions, Select, TextArea } from "panther";
import { createSignal, For, type JSX, onCleanup, Show } from "solid-js";
import {
  MenuDivider,
  MenuFlyout,
  PopoverRow,
  ToolbarPopover,
} from "~/components/products/_shared/mod.ts";
import { instanceState } from "~/state/instance/t1_store";
import { LogoSectionEditor } from "./logo_section_editor";
import { ThemePicker } from "./style_editor/mod.ts";

type Props = {
  config: SlideDeckConfig;
  canEdit: boolean;
  /** Applied optimistically and saved; the deck refetches behind it. */
  onPatch: (patch: Partial<SlideDeckConfig>) => void;
  onOpenAllSettings: () => void;
};

// The floating panel a flyout row opens: the menu's own popover draws no
// surface around it, so each one brings its own (as the report's do).
function FlyoutPanel(p: { class: string; children: JSX.Element }) {
  return (
    <div
      class={`bg-base-100 ui-pad-sm shadow-floating max-h-[70vh] overflow-y-auto rounded border ${p.class}`}
    >
      {p.children}
    </div>
  );
}

// File: the whole-deck operations, as in Google Docs' File menu and the
// report toolbar's. It replaced the header's overflow menu outright, so it
// holds everything that menu did.
// The footer's own text is the one control that must not save per keystroke:
// each save remounts the slide editor. It is held locally and committed when
// focus leaves the field, and again when this panel goes with the menu (a
// textarea removed under the caret does not always fire focusout).
function FooterPanel(p: {
  config: SlideDeckConfig;
  onPatch: (patch: Partial<SlideDeckConfig>) => void;
}) {
  const [draft, setDraft] = createSignal<string | undefined>();
  function commit() {
    const text = draft();
    setDraft(undefined);
    if (text === undefined || text === p.config.globalFooterText) return;
    p.onPatch({ globalFooterText: text });
  }
  onCleanup(commit);

  return (
    <div class="ui-spy-sm" onFocusOut={commit}>
      <Checkbox
        label={t3({
          en: "Global footer text on content slides",
          fr: "Texte de pied de page global sur les diapositives de contenu",
          pt: "Texto de rodapé global nos diapositivos de conteúdo",
        })}
        checked={p.config.globalFooterText !== undefined}
        onChange={(v) => p.onPatch({ globalFooterText: v ? "" : undefined })}
      />
      <Show when={p.config.globalFooterText !== undefined}>
        <TextArea
          label={t3({
            en: "Footer text",
            fr: "Texte du pied de page",
            pt: "Texto do rodapé",
          })}
          value={draft() ?? p.config.globalFooterText ?? ""}
          onChange={setDraft}
          fullWidth
          height="40px"
        />
      </Show>
      <Checkbox
        label={t3({
          en: "Show page numbers",
          fr: "Afficher les numéros de page",
          pt: "Mostrar números de página",
        })}
        checked={p.config.showPageNumbers}
        onChange={(v) => p.onPatch({ showPageNumbers: v })}
      />
    </div>
  );
}

export function DeckFileMenu(p: {
  onDownload: () => void;
  onShare: () => void;
  onRename: () => void;
  /** How many slides the rail has selected: none means nothing to copy. */
  selectedCount: number;
  onCopyToDeck: () => void;
}) {
  return (
    <ToolbarPopover
      menu
      tour="deck-file-menu"
      label={t3({ en: "File", fr: "Fichier", pt: "Ficheiro" })}
      title={t3({ en: "File", fr: "Fichier", pt: "Ficheiro" })}
    >
      {(close) => (
        <div class="flex w-56 flex-col">
          <PopoverRow
            active={false}
            onClick={() => {
              close();
              p.onDownload();
            }}
          >
            {t3({ en: "Download…", fr: "Télécharger…", pt: "Transferir…" })}
          </PopoverRow>
          <PopoverRow
            active={false}
            onClick={() => {
              close();
              p.onShare();
            }}
          >
            {t3({ en: "Share…", fr: "Partager…", pt: "Partilhar…" })}
          </PopoverRow>
          <MenuDivider />
          <PopoverRow
            active={false}
            onClick={() => {
              close();
              p.onRename();
            }}
          >
            {t3({
              en: "Name and folder…",
              fr: "Nom et dossier…",
              pt: "Nome e pasta…",
            })}
          </PopoverRow>
          <PopoverRow
            active={false}
            disabled={p.selectedCount === 0}
            onClick={() => {
              close();
              p.onCopyToDeck();
            }}
          >
            {p.selectedCount > 0
              ? t3({
                en: `Copy ${p.selectedCount} slide(s) to deck…`,
                fr: `Copier ${p.selectedCount} diapositive(s) vers une présentation…`,
                pt: `Copiar ${p.selectedCount} diapositivo(s) para apresentação…`,
              })
              : t3({
                en: "Copy to deck…",
                fr: "Copier vers une présentation…",
                pt: "Copiar para apresentação…",
              })}
          </PopoverRow>
        </div>
      )}
    </ToolbarPopover>
  );
}

export function DeckMenu(p: Props) {
  const logos = () => p.config.logos;

  function patchLogos(patch: Partial<SlideDeckConfig["logos"]>) {
    p.onPatch({ logos: { ...logos(), ...patch } });
  }

  function setCustomLogo(index: number, value: string) {
    patchLogos({
      availableCustom: logos().availableCustom.map((l, i) =>
        i === index ? value : l,
      ),
    });
  }

  // Dropping a custom logo drops it from every section that had picked it,
  // exactly as the settings screen does. Otherwise a slide keeps asking for an
  // image the deck no longer offers.
  function removeCustomLogo(index: number) {
    const removed = logos().availableCustom[index];
    const without = (selected: string[]) =>
      removed ? selected.filter((l) => l !== removed) : selected;
    const next = logos();
    p.onPatch({
      logos: {
        ...next,
        availableCustom: next.availableCustom.toSpliced(index, 1),
        cover: { ...next.cover, selected: without(next.cover.selected) },
        header: { ...next.header, selected: without(next.header.selected) },
        footer: { ...next.footer, selected: without(next.footer.selected) },
      },
    });
  }

  const imageOptions = () =>
    getSelectOptions(
      instanceState.assets.filter((f) => f.isImage).map((f) => f.fileName),
    );

  return (
    <ToolbarPopover
      menu
      tour="deck-menu"
      label={t3({ en: "Deck", fr: "Présentation", pt: "Apresentação" })}
      title={t3({
        en: "Deck settings",
        fr: "Paramètres de la présentation",
        pt: "Definições da apresentação",
      })}
    >
      {(close) => (
        <div class="flex w-56 flex-col">
          <Show when={p.canEdit}>
            <MenuFlyout label={t3({ en: "Theme", fr: "Thème", pt: "Tema" })}>
              <FlyoutPanel class="w-[29rem]">
                <ThemePicker
                  value={p.config.theme}
                  config={p.config}
                  onChange={(theme) => {
                    p.onPatch({ theme });
                    close();
                  }}
                />
              </FlyoutPanel>
            </MenuFlyout>

            <MenuFlyout label={t3({ en: "Logos", fr: "Logos", pt: "Logótipos" })}>
              <FlyoutPanel class="w-80">
                <div class="ui-spy-sm">
                  <div>
                    <div class="text-base-content-muted font-700 mb-2 text-sm">
                      {t3({
                        en: "Custom logos",
                        fr: "Logos personnalisés",
                        pt: "Logótipos personalizados",
                      })}
                    </div>
                    <div class="ui-spy-sm">
                      <For each={logos().availableCustom}>
                        {(logo, i_logo) => (
                          <div class="ui-gap-sm flex items-center">
                            <Select
                              options={imageOptions()}
                              value={logo}
                              onChange={(v) => setCustomLogo(i_logo(), v)}
                              fullWidth
                            />
                            <Button
                              intent="danger"
                              onClick={() => removeCustomLogo(i_logo())}
                              outline
                              iconName="trash"
                            />
                          </div>
                        )}
                      </For>
                      <Button
                        onClick={() =>
                          patchLogos({
                            availableCustom: [...logos().availableCustom, ""],
                          })}
                        iconName="plus"
                        size="sm"
                      >
                        {t3({ en: "Add", fr: "Ajouter", pt: "Adicionar" })}
                      </Button>
                    </div>
                  </div>
                  <MenuDivider />
                  <LogoSectionEditor
                    title={t3({ en: "Cover", fr: "Couverture", pt: "Capa" })}
                    config={logos().cover}
                    customLogos={logos().availableCustom.filter(Boolean)}
                    onChange={(c) => patchLogos({ cover: c })}
                  />
                  <LogoSectionEditor
                    title={t3({
                      en: "Content header",
                      fr: "En-tête de contenu",
                      pt: "Cabeçalho de conteúdo",
                    })}
                    config={logos().header}
                    customLogos={logos().availableCustom.filter(Boolean)}
                    onChange={(c) => patchLogos({ header: c })}
                  />
                  <LogoSectionEditor
                    title={t3({
                      en: "Content footer",
                      fr: "Pied de page de contenu",
                      pt: "Rodapé de conteúdo",
                    })}
                    config={logos().footer}
                    customLogos={logos().availableCustom.filter(Boolean)}
                    onChange={(c) => patchLogos({ footer: c })}
                  />
                </div>
              </FlyoutPanel>
            </MenuFlyout>

            <MenuFlyout
              label={t3({
                en: "Footer & page numbers",
                fr: "Pied de page et numéros",
                pt: "Rodapé e números de página",
              })}
            >
              <FlyoutPanel class="w-80">
                <FooterPanel config={p.config} onPatch={p.onPatch} />
              </FlyoutPanel>
            </MenuFlyout>

            <MenuDivider />
          </Show>

          <PopoverRow
            active={false}
            onClick={() => {
              close();
              p.onOpenAllSettings();
            }}
          >
            {t3({
              en: "All deck settings…",
              fr: "Tous les paramètres…",
              pt: "Todas as definições…",
            })}
          </PopoverRow>
        </div>
      )}
    </ToolbarPopover>
  );
}
