import { SlideDeckConfig, t3, TC, _GFF_GREEN, _NIGERIA_GREEN } from "lib";
import {
  Button,
  Checkbox,
  ColorPicker,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  Input,
  Select,
  SettingsSection,
  TextArea,
  getSelectOptions,
  timActionDelete,
  timActionButton,
  APIResponseWithData,
} from "panther";
import { For, Show } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { instanceState } from "~/state/instance/t1_store";
import { LayoutPicker } from "./style_editor/LayoutPicker.tsx";
import { TreatmentPicker } from "./style_editor/TreatmentPicker.tsx";
import { LogoSectionEditor } from "./slide_editor/LogoSectionEditor.tsx";
import { StylePreview } from "./style_editor/StylePreview.tsx";

export type SlideDeckSettingsProps = {
  projectId: string;
  config: SlideDeckConfig;
  heading: string;
  nameLabel: string;
  showPageNumbersSuffix?: string;
  saveConfig: (
    config: SlideDeckConfig,
  ) => Promise<APIResponseWithData<{ lastUpdated: string }>>;
  onSaved: (lastUpdated: string) => Promise<void>;
  deleteAction?: {
    confirmText: string;
    itemLabel: string;
    deleteButtonLabel: string;
    onDelete: () => Promise<APIResponseWithData<never> | { success: true }>;
  };
};

type Props = EditorComponentProps<SlideDeckSettingsProps, "AFTER_DELETE">;

export function SlideDeckSettings(p: Props) {
  const [tempConfig, setTempConfig] = createStore<SlideDeckConfig>(
    structuredClone(p.config),
  );

  function addCustomLogo() {
    setTempConfig("logos", "availableCustom", (prev) => [...prev, ""]);
  }

  function removeCustomLogo(index: number) {
    const removed = tempConfig.logos.availableCustom[index];
    setTempConfig("logos", "availableCustom", (prev) =>
      prev.toSpliced(index, 1),
    );
    if (removed) {
      setTempConfig("logos", "cover", "selected", (prev) =>
        prev.filter((l) => l !== removed),
      );
      setTempConfig("logos", "header", "selected", (prev) =>
        prev.filter((l) => l !== removed),
      );
      setTempConfig("logos", "footer", "selected", (prev) =>
        prev.filter((l) => l !== removed),
      );
    }
  }

  const save = timActionButton(
    async () => {
      const newConfig = unwrap(tempConfig);
      newConfig.logos.availableCustom =
        newConfig.logos.availableCustom.filter(Boolean);
      const res = await p.saveConfig(newConfig);
      if (res.success === false) {
        return res;
      }
      await p.onSaved(res.data.lastUpdated);
      return res;
    },
    () => p.close(undefined),
  );

  async function attemptDelete() {
    if (!p.deleteAction) return;
    const da = p.deleteAction;
    const deleteAction = timActionDelete(
      {
        text: da.confirmText,
        itemList: [da.itemLabel],
      },
      da.onDelete,
      () => p.close("AFTER_DELETE"),
    );
    await deleteAction.click();
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading={p.heading}>
          <div class="ui-gap-sm flex">
            <Button
              onClick={save.click}
              state={save.state()}
              intent="success"
              iconName="save"
            >
              {t3(TC.save)}
            </Button>
            <Button
              onClick={() => p.close(undefined)}
              intent="neutral"
              iconName="x"
            >
              {t3(TC.cancel)}
            </Button>
          </div>
        </HeadingBar>
      }
    >
      <div class="ui-pad ui-spy">
        <div class="ui-gap grid grid-cols-2">
          <SettingsSection header={t3(TC.general)}>
            <Input
              label={p.nameLabel}
              value={tempConfig.label}
              onChange={(v) => setTempConfig("label", v)}
              fullWidth
            />
          </SettingsSection>
          <SettingsSection
            header={t3({ en: "Footer text", fr: "Texte de pied de page" })}
          >
            <Checkbox
              label={t3({
                en: "Set global footer text for all content slides",
                fr: "Définir un texte de pied de page global pour toutes les diapositives de contenu",
              })}
              checked={tempConfig.globalFooterText !== undefined}
              onChange={(v) => {
                if (v) {
                  setTempConfig("globalFooterText", "");
                } else {
                  setTempConfig("globalFooterText", undefined);
                }
              }}
            />
            <Show when={tempConfig.globalFooterText !== undefined}>
              <TextArea
                label={t3({ en: "Footer text", fr: "Texte du pied de page" })}
                value={tempConfig.globalFooterText!}
                onChange={(v: string) => setTempConfig("globalFooterText", v)}
                fullWidth
                height="40px"
              />
            </Show>
            <Checkbox
              label={`${t3({ en: "Show page numbers", fr: "Afficher les numéros de page" })}${p.showPageNumbersSuffix ? ` ${p.showPageNumbersSuffix}` : ""}`}
              checked={tempConfig.showPageNumbers}
              onChange={(v) => setTempConfig("showPageNumbers", v)}
            />
          </SettingsSection>
          <div class="col-span-2">
            <SettingsSection header={t3({ en: "Logos", fr: "Logos" })}>
              <div class="grid grid-cols-4 gap-6">
                <div class="ui-spy-sm">
                  <div class="text-base-content/70 font-700 mb-2 text-sm">
                    {t3({ en: "Custom logos", fr: "Logos personnalisés" })}
                  </div>
                  <For each={tempConfig.logos.availableCustom}>
                    {(logo, i_logo) => (
                      <div class="ui-gap-sm flex items-center">
                        <Select
                          options={getSelectOptions(
                            instanceState.assets
                              .filter((f) => f.isImage)
                              .map((f) => f.fileName),
                          )}
                          value={logo}
                          onChange={(v) =>
                            setTempConfig(
                              "logos",
                              "availableCustom",
                              i_logo(),
                              v,
                            )
                          }
                          fullWidth
                        />
                        <Button
                          intent="danger"
                          onClick={() => removeCustomLogo(i_logo())}
                          outline
                          iconName="trash"
                        ></Button>
                      </div>
                    )}
                  </For>
                  <Button onClick={addCustomLogo} iconName="plus" size="sm">
                    {t3({ en: "Add", fr: "Ajouter" })}
                  </Button>
                </div>
                <LogoSectionEditor
                  title={t3({ en: "Cover", fr: "Couverture" })}
                  config={tempConfig.logos.cover}
                  customLogos={tempConfig.logos.availableCustom.filter(Boolean)}
                  onChange={(c) => setTempConfig("logos", "cover", c)}
                />
                <LogoSectionEditor
                  title={t3({ en: "Content header", fr: "En-tête de contenu" })}
                  config={tempConfig.logos.header}
                  customLogos={tempConfig.logos.availableCustom.filter(Boolean)}
                  onChange={(c) => setTempConfig("logos", "header", c)}
                />
                <LogoSectionEditor
                  title={t3({ en: "Content footer", fr: "Pied de page de contenu" })}
                  config={tempConfig.logos.footer}
                  customLogos={tempConfig.logos.availableCustom.filter(Boolean)}
                  onChange={(c) => setTempConfig("logos", "footer", c)}
                />
              </div>
            </SettingsSection>
          </div>
          <div class="col-span-2">
            <SettingsSection header={t3({ en: "Style", fr: "Style" })}>
              <div class="ui-spy">
                <StylePreview config={tempConfig} />
                <ColorPicker
                  label={t3({
                    en: "Primary color",
                    fr: "Couleur primaire",
                  })}
                  value={tempConfig.primaryColor}
                  onChange={(v) => setTempConfig("primaryColor", v)}
                  colorSet="slideBackgrounds"
                  extraColors={[_GFF_GREEN, _NIGERIA_GREEN]}
                  allowCustomHex
                />
                <LayoutPicker
                  value={tempConfig.layout}
                  onChange={(v) => setTempConfig("layout", v)}
                  primaryColor={tempConfig.primaryColor}
                />
                <TreatmentPicker
                  value={tempConfig.treatment}
                  onChange={(v) => setTempConfig("treatment", v)}
                  primaryColor={tempConfig.primaryColor}
                />
                <Select
                  label={t3({
                    en: "Background detail",
                    fr: "Détail de l'arrière-plan",
                  })}
                  value={tempConfig.overlay}
                  options={[
                    { value: "none", label: t3({ en: "None", fr: "Aucun" }) },
                    { value: "dots", label: t3({ en: "Dots (image)", fr: "Points (image)" }) },
                    { value: "rivers", label: t3({ en: "Maze (image)", fr: "Labyrinthe (image)" }) },
                    { value: "waves", label: t3({ en: "Waves (image)", fr: "Vagues (image)" }) },
                    { value: "world", label: t3({ en: "World (image)", fr: "Monde (image)" }) },
                    { value: "pattern-ovals", label: t3({ en: "Ovals", fr: "Ovales" }) },
                    { value: "pattern-circles", label: t3({ en: "Circles", fr: "Cercles" }) },
                    { value: "pattern-dots", label: t3({ en: "Dots", fr: "Points" }) },
                    { value: "pattern-lines", label: t3({ en: "Lines", fr: "Lignes" }) },
                    { value: "pattern-grid", label: t3({ en: "Grid", fr: "Grille" }) },
                    { value: "pattern-chevrons", label: t3({ en: "Chevrons", fr: "Chevrons" }) },
                    { value: "pattern-waves", label: t3({ en: "Waves", fr: "Vagues" }) },
                    { value: "pattern-noise", label: t3({ en: "Noise", fr: "Bruit" }) },
                  ]}
                  onChange={(v) => setTempConfig("overlay", v as any)}
                />
              </div>
            </SettingsSection>
          </div>
                  </div>
        <Show when={p.deleteAction}>
          <div class="">
            <Button
              onClick={attemptDelete}
              intent="danger"
              outline
              iconName="trash"
            >
              {p.deleteAction!.deleteButtonLabel}
            </Button>
          </div>
        </Show>
      </div>
    </FrameTop>
  );
}
