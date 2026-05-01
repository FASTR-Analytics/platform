import { SlideDeckConfig, t3, TC } from "lib";
import { validateBrandColor } from "@timroberton/panther";
import {
  APIResponseWithData,
  Button,
  Checkbox,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  Select,
  SettingsSection,
  TextArea,
  getSelectOptions,
  timActionButton,
  timActionDelete,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { instanceState } from "~/state/instance/t1_store";
import { ColorThemePicker } from "./style_editor/ColorThemePicker.tsx";
import { FontPicker } from "./style_editor/FontPicker.tsx";
import { LayoutPicker } from "./style_editor/LayoutPicker.tsx";
import { OverlayPicker } from "./style_editor/OverlayPicker.tsx";
import {
  CoverTreatmentPicker,
  FreeformTreatmentPicker,
} from "./style_editor/TreatmentPicker.tsx";
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
  const [editingName, setEditingName] = createSignal(false);

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
      if (newConfig.colorTheme.type === "custom") {
        const v = validateBrandColor(newConfig.colorTheme.primary);
        if (!v.valid) {
          return { success: false, err: v.reason };
        }
      }
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
        <HeadingBar
          heading={
            <div class="flex items-center gap-2">
              <span>{p.heading}:</span>
              <Show when={!editingName()}>
                <span class="font-normal">{tempConfig.label}</span>
                <Button
                  iconName="pencil"
                  intent="neutral"
                  size="sm"
                  outline
                  onClick={() => setEditingName(true)}
                />
              </Show>
              <Show when={editingName()}>
                <input
                  type="text"
                  class="border-base-300 rounded border px-2 py-1 text-base font-normal"
                  value={tempConfig.label}
                  onInput={(e) => setTempConfig("label", e.currentTarget.value)}
                  onBlur={() => setEditingName(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setEditingName(false);
                  }}
                  autofocus
                />
              </Show>
            </div>
          }
        >
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
        <SettingsSection header={t3({ en: "Style", fr: "Style" })}>
          <div class="ui-spy">
            <StylePreview config={tempConfig} />
            <ColorThemePicker
              value={tempConfig.colorTheme}
              onChange={(v) => setTempConfig("colorTheme", v)}
            />
            <FontPicker
              value={tempConfig.fontFamily}
              onChange={(v) => setTempConfig("fontFamily", v)}
            />
            <LayoutPicker
              value={tempConfig.layout}
              onChange={(v) => setTempConfig("layout", v)}
            />
            <CoverTreatmentPicker
              value={tempConfig.coverAndSectionTreatment}
              onChange={(v) => setTempConfig("coverAndSectionTreatment", v)}
            />
            <FreeformTreatmentPicker
              value={tempConfig.freeformTreatment}
              onChange={(v) => setTempConfig("freeformTreatment", v)}
            />
            <OverlayPicker
              value={tempConfig.overlay}
              onChange={(v) => setTempConfig("overlay", v)}
            />
          </div>
        </SettingsSection>
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
                        setTempConfig("logos", "availableCustom", i_logo(), v)
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
              title={t3({
                en: "Content footer",
                fr: "Pied de page de contenu",
              })}
              config={tempConfig.logos.footer}
              customLogos={tempConfig.logos.availableCustom.filter(Boolean)}
              onChange={(c) => setTempConfig("logos", "footer", c)}
            />
          </div>
        </SettingsSection>
        <SettingsSection
          header={t3({
            en: "Footer & page numbers",
            fr: "Pied de page et numéros",
          })}
        >
          <div class="ui-spy-sm">
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
          </div>
        </SettingsSection>
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
