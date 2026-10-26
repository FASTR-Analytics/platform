import { type HfaTimePoint, t3, TC } from "lib";
import {
  Button,
  createFormAction,
  Input,
  MonthSelect,
  StateHolderFormError,
  YearSelect,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  timePoint?: HfaTimePoint;
  onSaved: (label: string) => void;
  onCancel: () => void;
};

export function HfaTimePointForm(p: Props) {
  const [label, setLabel] = createSignal(p.timePoint?.label ?? "");
  const [year, setYear] = createSignal(p.timePoint?.periodId.slice(0, 4) ?? "");
  const [month, setMonth] = createSignal(
    p.timePoint?.periodId.slice(4, 6) ?? "",
  );

  const save = createFormAction(async () => {
    const trimmed = label().trim();
    if (!trimmed) {
      return {
        success: false,
        err: t3({
          en: "Label cannot be empty",
          fr: "Le libellé ne peut pas être vide",
          pt: "A etiqueta não pode estar vazia",
        }),
      };
    }
    if (!year() || !month()) {
      return {
        success: false,
        err: t3({
          en: "You must select a year and month",
          fr: "Vous devez sélectionner une année et un mois",
          pt: "Tem de selecionar um ano e um mês",
        }),
      };
    }
    const periodId = `${year()}${month()}`;
    const oldLabel = p.timePoint?.label;
    const res = oldLabel === undefined
      ? await serverActions.createHfaTimePoint({ label: trimmed, periodId })
      : await serverActions.updateHfaTimePoint({
        oldLabel,
        newLabel: trimmed !== oldLabel ? trimmed : undefined,
        periodId,
      });
    if (res.success) {
      p.onSaved(trimmed);
    }
    return res;
  });

  return (
    <div class="ui-spy rounded border p-4">
      <div class="ui-text-heading">
        {p.timePoint
          ? t3({
            en: "Edit time point",
            fr: "Modifier le point temporel",
            pt: "Editar ponto temporal",
          })
          : t3({
            en: "Add time point",
            fr: "Ajouter un point temporel",
            pt: "Adicionar ponto temporal",
          })}
      </div>
      <div class="flex items-end gap-4">
        <div class="w-64">
          <Input
            label={t3({ en: "Label", fr: "Libellé", pt: "Etiqueta" })}
            value={label()}
            onChange={setLabel}
            fullWidth
          />
        </div>
        <YearSelect
          label={t3({ en: "Year", fr: "Année", pt: "Ano" })}
          value={year()}
          onChange={setYear}
        />
        <MonthSelect
          label={t3({ en: "Month", fr: "Mois", pt: "Mês" })}
          value={month()}
          onChange={setMonth}
        />
      </div>
      <StateHolderFormError state={save.state()} />
      <div class="ui-gap-sm flex">
        <Button
          iconName="save"
          intent="success"
          state={save.state()}
          onClick={save.click}
        >
          {t3(TC.save)}
        </Button>
        <Button intent="neutral" onClick={p.onCancel}>
          {t3(TC.cancel)}
        </Button>
      </div>
    </div>
  );
}
