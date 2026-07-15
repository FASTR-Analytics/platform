import { t3 } from "lib";
import { Slider } from "panther";
import { Match, Switch } from "solid-js";
import { PeriodSelector } from "../../../PeriodSelector";
import type { Dhis2WizardTimeChoice } from "./_step_time";

type Props = {
  timeChoice: Dhis2WizardTimeChoice;
  // Now: an explicit start–end period range (the immediate-run contract).
  periodMin: number;
  periodMax: number;
  startPeriod: () => number;
  setStartPeriod: (v: number) => void;
  endPeriod: () => number;
  setEndPeriod: (v: number) => void;
  monthsBack: () => number;
  setMonthsBack: (v: number) => void;
};

const MAX_MONTHS_BACK = 24;

export function Dhis2StepConfig(p: Props) {
  return (
    <div class="ui-spy">
      <Switch>
        <Match when={p.timeChoice === "now" || p.timeChoice === "later"}>
          <div>
            <label class="font-700 mb-4 block text-base">
              {t3({ en: "Select period range", fr: "Sélectionner la plage de périodes", pt: "Selecionar o intervalo de períodos" })}
            </label>
            <PeriodSelector
              minPeriodId={p.periodMin}
              maxPeriodId={p.periodMax}
              selectedStartPeriodId={p.startPeriod()}
              selectedEndPeriodId={p.endPeriod()}
              periodType="year-month"
              onChangeStart={p.setStartPeriod}
              onChangeEnd={p.setEndPeriod}
            />
          </div>
        </Match>
        <Match when={p.timeChoice === "recurring"}>
          <div class="ui-gap-sm ui-pad border-base-300 rounded border">
            <Slider
              label={t3({ en: "Last N months", fr: "Derniers N mois", pt: "Últimos N meses" })}
              showValueInLabel
              valueInLabelFormatter={(v) => String(v)}
              value={p.monthsBack()}
              onChange={p.setMonthsBack}
              min={1}
              max={MAX_MONTHS_BACK}
              fullWidth
            />
          </div>
          <div class="text-xs">
            {t3({
              en: "Resolved fresh at every fire — N months total, ending with the current instance-calendar month (same convention as the visualization editor's \"Last N months\" filter).",
              fr: "Recalculé à chaque déclenchement — N mois au total, se terminant par le mois courant du calendrier de l'instance (même convention que le filtre « Derniers N mois » de l'éditeur de visualisation).",
              pt: "Recalculado em cada disparo — N meses no total, terminando no mês atual do calendário da instância (mesma convenção do filtro «Últimos N meses» do editor de visualização).",
            })}
          </div>
        </Match>
      </Switch>
    </div>
  );
}
