import { t3 } from "lib";
import { Input } from "panther";
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
  // Later / Recurring: both are schedule rows, and the schedule selection
  // shape (Dhis2ScheduleSelection / dhis2ScheduleFieldsSchema) only ever
  // carries a rolling window — there is no explicit start/end for a
  // schedule, one-shot included. A future fire's "current month" hasn't
  // happened yet, so a rolling window resolved at fire time is the only
  // selection that makes sense either way.
  monthsBack: () => string;
  setMonthsBack: (v: string) => void;
};

export function Dhis2StepConfig(p: Props) {
  return (
    <div class="ui-spy">
      <Switch>
        <Match when={p.timeChoice === "now"}>
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
        <Match when={p.timeChoice !== "now"}>
          <Input
            label={t3({
              en: "Months of history (current month + previous N)",
              fr: "Mois d'historique (mois courant + N précédents)",
              pt: "Meses de histórico (mês atual + N anteriores)",
            })}
            type="number"
            value={p.monthsBack()}
            onChange={p.setMonthsBack}
          />
          <div class="text-xs">
            {t3({
              en: "Resolved fresh at every fire — always the current instance-calendar month plus the previous N months.",
              fr: "Recalculé à chaque déclenchement — toujours le mois courant du calendrier de l'instance plus les N mois précédents.",
              pt: "Recalculado em cada disparo — sempre o mês atual do calendário da instância mais os N meses anteriores.",
            })}
          </div>
        </Match>
      </Switch>
    </div>
  );
}
