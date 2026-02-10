import {
  SlideDeckConfig,
  getTextColorForBackground,
  isColorLight,
  t2,
  T,
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
  Select,
  SettingsSection,
  StateHolderWrapper,
  getSelectOptions,
  timActionDelete,
  timActionButton,
  timQuery,
  APIResponseWithData,
} from "panther";
import { For, Show } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { t } from "lib";

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
    t2(T.FRENCH_UI_STRINGS.loading_files),
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

  const primaryTextColor = () => getTextColorForBackground(tempConfig.primaryColor);
  const lightOrDark = () => isColorLight(tempConfig.primaryColor) ? "light" : "dark";

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
              {t2(T.FRENCH_UI_STRINGS.save)}
            </Button>
            <Button
              onClick={() => p.close(undefined)}
              intent="neutral"
              iconName="x"
            >
              {t2(T.FRENCH_UI_STRINGS.cancel)}
            </Button>
          </div>
        </HeadingBar>
      }
    >
      <div class="ui-pad ui-spy">
        <div class="ui-gap grid grid-cols-2">
          <SettingsSection header={t2(T.FRENCH_UI_STRINGS.general)}>
            <Input
              label={p.nameLabel}
              value={tempConfig.label}
              onChange={(v) => setTempConfig("label", v)}
              fullWidth
            />
          </SettingsSection>
          <SettingsSection header={t2(T.FRENCH_UI_STRINGS.logos)}>
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
                      {t2(T.FRENCH_UI_STRINGS.add_logo)}
                    </Button>
                  </div>
                );
              }}
            </StateHolderWrapper>
          </SettingsSection>
          <div class="col-span-2">
            <SettingsSection header={t2(T.FRENCH_UI_STRINGS.style)}>
              <div class="ui-gap flex flex-wrap">
                <div class="ui-spy-sm w-56">
                  <ColorPicker
                    label={t2(T.FRENCH_UI_STRINGS.report_color_theme)}
                    value={tempConfig.primaryColor}
                    onChange={(v) => setTempConfig("primaryColor", v)}
                    colorSet="standard"
                    extraColors={[_GFF_GREEN, _NIGERIA_GREEN]}
                    showCheckeredBackground
                    fullWidth
                  />
                  <Select
                    label={t2(T.FRENCH_UI_STRINGS.background_detail)}
                    value={tempConfig.overlay}
                    options={[
                      { value: "none", label: "None" },
                      { value: "dots", label: "Dots" },
                      { value: "rivers", label: "Maze" },
                      { value: "waves", label: "Waves" },
                      { value: "world", label: "World" },
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
                      <div class="font-700 text-2xl">Example title</div>
                      <div class="font-400 text-base">Sub-title</div>
                    </div>
                  </div>
                </div>
              </div>
            </SettingsSection>
          </div>
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
