import {
  SlideDeckConfig,
  getPrimaryColor,
  getTextColorForBackground,
  isColorLight,
  t3,
  TC,
  _GFF_GREEN,
  _NIGERIA_GREEN,
} from "lib";
import {
  Button,
  Checkbox,
  ColorPicker,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  Input,
  LabelHolder,
  MultiSelect,
  Select,
  SettingsSection,
  StateHolderWrapper,
  TextArea,
  getSelectOptions,
  timActionDelete,
  timActionButton,
  timQuery,
  APIResponseWithData,
} from "panther";
import { For, Show } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";

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
  const assetListing = timQuery(
    () => serverActions.getAssets({}),
    t3(TC.loadingFiles),
  );

  const [tempConfig, setTempConfig] = createStore<SlideDeckConfig>(
    structuredClone(p.config),
  );

  function addLogo() {
    setTempConfig("logos", (prev) =>
      prev === undefined ? [""] : [...prev, ""],
    );
  }

  function removeLogo(index: number) {
    setTempConfig("logos", (prev) =>
      prev === undefined ? [] : prev.toSpliced(index, 1),
    );
  }

  const save = timActionButton(
    async () => {
      const newConfig = unwrap(tempConfig);
      newConfig.logos = newConfig.logos?.filter(Boolean) ?? [];
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

  const primaryTextColor = () =>
    getTextColorForBackground(getPrimaryColor(tempConfig.primaryColor));
  const lightOrDark = () =>
    isColorLight(getPrimaryColor(tempConfig.primaryColor)) ? "light" : "dark";

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
          <SettingsSection header={t3({ en: "Logos", fr: "Logos" })}>
            <StateHolderWrapper state={assetListing.state()} noPad>
              {(keyedAssets) => {
                return (
                  <div class="ui-spy-sm">
                    <For each={tempConfig.logos}>
                      {(logo, i_logo) => {
                        return (
                          <div class="ui-gap-sm flex items-center">
                            <Select
                              options={getSelectOptions(
                                keyedAssets
                                  .filter((f) => f.isImage)
                                  .map((f) => f.fileName),
                              )}
                              value={logo}
                              onChange={(v) =>
                                setTempConfig("logos", i_logo(), v)
                              }
                              fullWidth
                            />
                            <Button
                              intent="danger"
                              onClick={() => removeLogo(i_logo())}
                              outline
                              iconName="trash"
                            ></Button>
                          </div>
                        );
                      }}
                    </For>
                    <Button onClick={addLogo} iconName="plus">
                      {t3({ en: "Add logo", fr: "Ajouter un logo" })}
                    </Button>
                  </div>
                );
              }}
            </StateHolderWrapper>
          </SettingsSection>
          {/* <div class="col-span-2"> */}
          <SettingsSection header={t3({ en: "Style", fr: "Style" })}>
            <div class="ui-gap flex flex-wrap">
              <div class="ui-spy-sm w-56">
                <ColorPicker
                  label={t3({
                    en: "Report color theme",
                    fr: "Thème de couleur du rapport",
                  })}
                  value={tempConfig.primaryColor}
                  onChange={(v) => setTempConfig("primaryColor", v)}
                  colorSet="standard"
                  extraColors={[_GFF_GREEN, _NIGERIA_GREEN]}
                  showCheckeredBackground
                  fullWidth
                />
                <Select
                  label={t3({
                    en: "Background detail",
                    fr: "Détail de l'arrière-plan",
                  })}
                  value={tempConfig.overlay}
                  options={[
                    { value: "none", label: t3({ en: "None", fr: "Aucun" }) },
                    {
                      value: "dots",
                      label: t3({ en: "Dots", fr: "Points" }),
                    },
                    {
                      value: "rivers",
                      label: t3({ en: "Maze", fr: "Labyrinthe" }),
                    },
                    {
                      value: "waves",
                      label: t3({ en: "Waves", fr: "Vagues" }),
                    },
                    {
                      value: "world",
                      label: t3({ en: "World", fr: "Monde" }),
                    },
                  ]}
                  onChange={(v) =>
                    setTempConfig(
                      "overlay",
                      v as "dots" | "rivers" | "waves" | "world" | "none",
                    )
                  }
                  fullWidth
                />
              </div>
              <div
                class="border-base-300 relative aspect-video w-96 rounded border"
                style={{
                  background: tempConfig.primaryColor,
                }}
              >
                <Show when={tempConfig.overlay !== "none"}>
                  <img
                    class="w-full rounded"
                    src={`/images/${tempConfig.overlay}_for_${lightOrDark()}_themes.png`}
                  />
                </Show>
                <div
                  class="font-700 absolute inset-0 flex items-center justify-center"
                  style={{
                    "letter-spacing": "-0.02em",
                    color: primaryTextColor(),
                  }}
                >
                  <div class="space-y-1 text-center">
                    <div class="font-700 text-2xl">
                      {t3({ en: "Example title", fr: "Titre exemple" })}
                    </div>
                    <div class="font-400 text-base">
                      {t3({ en: "Sub-title", fr: "Sous-titre" })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SettingsSection>
          {/* </div>
          <div class="col-span-2"> */}
          <SettingsSection header={t3({ en: "Footer", fr: "Pied de page" })}>
            <Checkbox
              label={t3({
                en: "Set global footer for all content slides",
                fr: "Définir un pied de page global pour toutes les diapositives de contenu",
              })}
              checked={tempConfig.deckFooter !== undefined}
              onChange={(v) => {
                if (v) {
                  setTempConfig("deckFooter", { text: "", logos: [] });
                } else {
                  setTempConfig("deckFooter", undefined);
                }
              }}
            />
            <Show when={tempConfig.deckFooter !== undefined}>
              <TextArea
                label={t3({ en: "Footer text", fr: "Texte du pied de page" })}
                value={tempConfig.deckFooter!.text}
                onChange={(v: string) => setTempConfig("deckFooter", "text", v)}
                fullWidth
                height="40px"
              />
              <LabelHolder
                label={t3({
                  en: "Footer logos",
                  fr: "Logos de pied de page",
                })}
              >
                <Show
                  when={(tempConfig.logos ?? []).length > 0}
                  fallback={
                    <div class="text-neutral text-xs">
                      {t3({
                        en: "No logos set in deck settings",
                        fr: "Aucun logo défini dans les paramètres",
                      })}
                    </div>
                  }
                >
                  <MultiSelect
                    values={tempConfig.deckFooter!.logos}
                    options={(tempConfig.logos ?? [])
                      .filter(Boolean)
                      .map((logo) => ({
                        value: logo,
                        label: logo,
                      }))}
                    onChange={(selectedLogos) => {
                      setTempConfig("deckFooter", "logos", selectedLogos);
                    }}
                  />
                </Show>
              </LabelHolder>
            </Show>
          </SettingsSection>
          {/* </div> */}
          {/* <SettingsSection header={t("Page details")}>
            <div class="max-w-96">
              <Checkbox
                label={`${t2(T.FRENCH_UI_STRINGS.show_page_numbers)}${p.showPageNumbersSuffix ? ` ${p.showPageNumbersSuffix}` : ""}`}
                checked={tempConfig.showPageNumbers}
                onChange={(v) => setTempConfig("showPageNumbers", v)}
              />
            </div>
            <div class="ui-spy-sm w-96">
              <Checkbox
                label={t2(T.FRENCH_UI_STRINGS.add_watermark)}
                checked={tempConfig.useWatermark}
                onChange={(v) => setTempConfig("useWatermark", v)}
              />
              <Show when={tempConfig.useWatermark}>
                <Input
                  label={t2(T.FRENCH_UI_STRINGS.watermark_text)}
                  value={tempConfig.watermarkText ?? ""}
                  onChange={(v) => setTempConfig("watermarkText", v)}
                  fullWidth
                />
              </Show>
            </div>
          </SettingsSection> */}
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
