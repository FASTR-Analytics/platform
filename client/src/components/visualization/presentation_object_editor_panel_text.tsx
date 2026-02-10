import { PresentationObjectConfig, PresentationObjectDetail, t3 } from "lib";
import { Slider, TextArea } from "panther";
import { SetStoreFunction } from "solid-js/store";

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
          label={t3({ en: "Caption", fr: "Titre" })}
          value={p.tempConfig.t.caption}
          onChange={(v) => p.setTempConfig("t", "caption", v)}
          fullWidth
          height="80px"
        />
        <Slider
          label={t3({ en: "Caption font size", fr: "Taille de la police des légendes" })}
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
          label={t3({ en: "Sub-caption", fr: "Sous-titre" })}
          value={p.tempConfig.t.subCaption}
          onChange={(v) => p.setTempConfig("t", "subCaption", v)}
          fullWidth
          height="80px"
        />
        <Slider
          label={t3({ en: "Sub-caption font size", fr: "Taille de la police des sous-titres" })}
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
          label={t3({ en: "Footnote", fr: "Note de bas de page" })}
          value={p.tempConfig.t.footnote}
          onChange={(v) => p.setTempConfig("t", "footnote", v)}
          fullWidth
          height="200px"
        />
        <Slider
          label={t3({ en: "Footnote font size", fr: "Taille de la police des notes de bas de page" })}
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
          {t3({ en: "In the above fields, you can use some special words to dynamically insert text.", fr: "Dans les champs ci-dessus, vous pouvez utiliser des mots spécifiques pour insérer du texte dynamiquement." })}
        </div>
        <div class="">
          {t3({ en: "Use", fr: "Utilisez" })} <span class="font-700">DATE_RANGE</span> {t3({ en: "or", fr: "ou" })}{" "}
          <span class="font-700">PLAGE_DE_DATES</span> {t3({ en: "to insert the date range of the data shown in the figure. (Note that this currently only works for timeseries visualizations.)", fr: "pour insérer la plage de dates des données affichées dans la figure. (Notez que cela ne fonctionne actuellement que pour les visualisations de séries chronologiques.)" })}
        </div>
        <div class="">
          {t3({ en: "Use", fr: "Utilisez" })} <span class="font-700">REPLICANT</span> {t3({ en: "to insert the full replicant name (e.g. an indicator, or an admin area). (Note that this only works if you have a disaggregator set for different charts.)", fr: "pour insérer le nom complet du réplicant (par exemple, un indicateur ou une zone d'administration). (Notez que cela ne fonctionne que si vous avez configuré un désagrégateur pour différents graphiques.)" })}
        </div>
        <div class="">
          {t3({ en: "You must spell these special words exactly correctly for them to work, including using capital letters and underscores, as above.", fr: "Vous devez orthographier ces mots spécifiques correctement pour qu'ils fonctionnent, y compris en utilisant des majuscules et des traits de soulignement, comme indiqué ci-dessus." })}
        </div>
      </div>
    </div>
  );
}
