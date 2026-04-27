import { t3, type PresentationOption } from "lib";

type Props = {
  type: PresentationOption;
  isSelected: boolean;
  isDisabled: boolean;
  disabledReason?: string;
  onSelect: () => void;
};

const TYPE_LABELS: Record<PresentationOption, { en: string; fr: string }> = {
  table: { en: "Table", fr: "Tableau" },
  timeseries: { en: "Time series", fr: "Série temporelle" },
  chart: { en: "Bar chart", fr: "Graphique en barres" },
  map: { en: "Map", fr: "Carte" },
};

export function TypeCard(p: Props) {
  return (
    <button
      type="button"
      class="ui-pad border-base-300 flex w-full items-center justify-center rounded border transition-colors"
      classList={{
        "bg-primary/10 border-primary font-700": p.isSelected,
        "bg-base-100 ui-hoverable": !p.isSelected && !p.isDisabled,
        "bg-base-200 opacity-50 cursor-not-allowed": p.isDisabled,
      }}
      disabled={p.isDisabled}
      title={p.isDisabled ? p.disabledReason : undefined}
      onClick={() => {
        if (!p.isDisabled) p.onSelect();
      }}
    >
      {t3(TYPE_LABELS[p.type])}
    </button>
  );
}
