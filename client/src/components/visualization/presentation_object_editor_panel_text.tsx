import {
  findFigureCaptionText,
  type CaptionTextKey,
  PresentationObjectConfig,
  PresentationObjectDetail,
  t3,
} from "lib";
import { TextArea } from "panther";
import { Show } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import { CollabMarkdownEditor } from "~/components/_shared/collab_markdown_editor";

/** Live-collab binding for the caption fields (character co-editing + carets). */
export type VizCaptionCollab = {
  configMap: Y.Map<unknown>;
  awareness: Awareness;
  canEdit: () => boolean;
};

type Props = {
  projectId: string;
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  captionCollab?: VizCaptionCollab;
};

export function PresentationObjectEditorPanelText(p: Props) {
  // A caption Y.Text when live-collab is bound (else undefined → TextArea).
  const captionText = (key: CaptionTextKey): Y.Text | undefined =>
    p.captionCollab
      ? findFigureCaptionText(p.captionCollab.configMap, key)
      : undefined;

  // One caption field: CollabMarkdownEditor when bound, plain TextArea otherwise.
  // The CodeMirror path mirrors edits back into tempConfig (onTextChange) so the
  // preview re-renders; the config push then syncs the Y.Text (idempotent).
  const CaptionField = (fp: {
    label: string;
    key: CaptionTextKey;
    height: string;
  }) => (
    <Show
      when={captionText(fp.key)}
      keyed
      fallback={
        <TextArea
          label={fp.label}
          value={p.tempConfig.t[fp.key]}
          onChange={(v) => p.setTempConfig("t", fp.key, v)}
          fullWidth
          height={fp.height}
        />
      }
    >
      {(yText) => (
        <div>
          <label class="ui-label">{fp.label}</label>
          <CollabMarkdownEditor
            yText={yText}
            awareness={p.captionCollab!.awareness}
            canEdit={p.captionCollab!.canEdit()}
            onTextChange={(v) => p.setTempConfig("t", fp.key, v)}
            height={fp.height}
            plain
          />
        </div>
      )}
    </Show>
  );

  return (
    <div data-viz-panel-scroll class="ui-pad ui-spy h-full w-full overflow-auto">
      <div class="ui-spy-sm">
        <CaptionField
          label={t3({ en: "Caption", fr: "Titre", pt: "Legenda" })}
          key="caption"
          height="80px"
        />
      </div>
      <div class="ui-spy-sm">
        <CaptionField
          label={t3({ en: "Sub-caption", fr: "Sous-titre", pt: "Sublegenda" })}
          key="subCaption"
          height="80px"
        />
      </div>
      <div class="ui-spy-sm">
        <CaptionField
          label={t3({ en: "Footnote", fr: "Note de bas de page", pt: "Nota de rodapé" })}
          key="footnote"
          height="200px"
        />
      </div>
      <div class="ui-spy-sm text-sm">
        <div class="">
          {t3({
            en: "In the above fields, you can use some special words to dynamically insert text.",
            fr: "Dans les champs ci-dessus, vous pouvez utiliser des mots spécifiques pour insérer du texte dynamiquement.",
            pt: "Nos campos acima, pode utilizar algumas palavras especiais para inserir texto dinamicamente.",
          })}
        </div>
        <div class="">
          {t3({ en: "Use", fr: "Utilisez", pt: "Utilize" })}{" "}
          <span class="font-700">DATE_RANGE</span>,{" "}
          <span class="font-700">PLAGE_DE_DATES</span>,{" "}
          {t3({ en: "or", fr: "ou", pt: "ou" })}{" "}
          <span class="font-700">INTERVALO_DE_DATAS</span>{" "}
          {t3({
            en: "to insert the date range of the data shown in the figure. (Note that this currently only works for timeseries visualizations.)",
            fr: "pour insérer la plage de dates des données affichées dans la figure. (Notez que cela ne fonctionne actuellement que pour les visualisations de séries chronologiques.)",
            pt: "para inserir o intervalo de datas dos dados apresentados na figura. (Note que atualmente isto só funciona para visualizações de séries temporais.)",
          })}
        </div>
        <div class="">
          {t3({ en: "Use", fr: "Utilisez", pt: "Utilize" })}{" "}
          <span class="font-700">REPLICANT</span>{" "}
          {t3({
            en: "to insert the full replicant name (e.g. an indicator, or an admin area). (Note that this only works if you have a disaggregator set for different charts.)",
            fr: "pour insérer le nom complet du réplicant (par exemple, un indicateur ou une zone d'administration). (Notez que cela ne fonctionne que si vous avez configuré un désagrégateur pour différents graphiques.)",
            pt: "para inserir o nome completo do replicante (por exemplo, um indicador ou uma zona administrativa). (Note que isto só funciona se tiver um desagregador definido para diferentes gráficos.)",
          })}
        </div>
        <div class="">
          {t3({
            en: "You must spell these special words exactly correctly for them to work, including using capital letters and underscores, as above.",
            fr: "Vous devez orthographier ces mots spécifiques correctement pour qu'ils fonctionnent, y compris en utilisant des majuscules et des traits de soulignement, comme indiqué ci-dessus.",
            pt: "Deve escrever estas palavras especiais exatamente de forma correta para que funcionem, incluindo a utilização de letras maiúsculas e sublinhados, como acima.",
          })}
        </div>
      </div>
    </div>
  );
}
