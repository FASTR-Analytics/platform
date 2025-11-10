import { PresentationObjectConfig, PresentationObjectDetail, t2, T } from "lib";
import { Slider, TextArea } from "panther";
import { SetStoreFunction } from "solid-js/store";
import { t } from "lib";

type Props = {
  projectId: string;
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

export function PresentationObjectEditorPanelText(p: Props) {
  return (
    <div class="ui-pad ui-spy h-full w-full overflow-auto">
      <div class="ui-spy-sm">
        <TextArea
          label={t2(T.FRENCH_UI_STRINGS.caption)}
          value={p.tempConfig.t.caption}
          onChange={(v) => p.setTempConfig("t", "caption", v)}
          fullWidth
          height="80px"
        />
        <Slider
          label={t2(T.Visualizations.caption_font)}
          min={0.5}
          max={3}
          step={0.1}
          value={p.tempConfig.t.captionRelFontSize ?? 2}
          onChange={(v) => p.setTempConfig("t", "captionRelFontSize", v)}
          fullWidth
          showValueInLabel
        />
      </div>
      <div class="ui-spy-sm">
        <TextArea
          label={t2(T.FRENCH_UI_STRINGS.subcaption)}
          value={p.tempConfig.t.subCaption}
          onChange={(v) => p.setTempConfig("t", "subCaption", v)}
          fullWidth
          height="80px"
        />
        <Slider
          label={t2(T.Visualizations.subcaption_font)}
          min={0.5}
          max={3}
          step={0.1}
          value={p.tempConfig.t.subCaptionRelFontSize ?? 1.3}
          onChange={(v) => p.setTempConfig("t", "subCaptionRelFontSize", v)}
          fullWidth
          showValueInLabel
        />
      </div>
      <div class="ui-spy-sm">
        <TextArea
          label={t2(T.FRENCH_UI_STRINGS.footnote)}
          value={p.tempConfig.t.footnote}
          onChange={(v) => p.setTempConfig("t", "footnote", v)}
          fullWidth
          height="200px"
        />
        <Slider
          label={t2(T.Visualizations.footnote_font)}
          min={0.1}
          max={3}
          step={0.1}
          value={p.tempConfig.t.footnoteRelFontSize ?? 0.9}
          onChange={(v) => p.setTempConfig("t", "footnoteRelFontSize", v)}
          fullWidth
          showValueInLabel
        />
      </div>
      <div class="ui-spy-sm text-sm">
        <div class="">
          In the above fields, you can use some special words to dynamically
          insert text.
        </div>
        <div class="">
          Use <span class="font-700">DATE_RANGE</span> or{" "}
          <span class="font-700">PLAGE_DE_DATES</span> to insert the date range
          of the data shown in the figure. (Note that this currently only works
          for timeseries visualizations.)
        </div>
        <div class="">
          Use <span class="font-700">REPLICANT</span> to insert the full
          replicant name (e.g. an indicator, or an admin area). (Note that this
          only works if you have a disaggregator set for different charts.)
        </div>
        <div class="">
          You must spell these special words exactly correctly for them to work,
          including using capital letters and underscores, as above.
        </div>
      </div>
    </div>
  );
}
