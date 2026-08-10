import { t3 } from "lib";
import { Dhis2IndicatorPicker } from "../_indicator_picker";

type Props = {
  selectedIds: () => string[];
  setSelectedIds: (ids: string[]) => void;
};

export function Dhis2StepIndicators(p: Props) {
  return (
    <div class="ui-spy">
      <div class="font-700 text-base">
        {t3({
          en: "Select the raw indicators to import",
          fr: "Sélectionner les indicateurs bruts à importer",
          pt: "Selecionar os indicadores brutos a importar",
        })}
      </div>
      <Dhis2IndicatorPicker
        selectedIds={p.selectedIds}
        setSelectedIds={p.setSelectedIds}
      />
    </div>
  );
}
