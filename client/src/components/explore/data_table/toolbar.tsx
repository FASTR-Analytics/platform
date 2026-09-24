import {
  periodChoiceId,
  t3,
  type AdminLevel,
  type GridColumns,
  type GridGrain,
  type GridPeriodChoice,
  type GridQuery,
} from "lib";
import {
  Button,
  Input,
  MultiSelectSearch,
  Select,
  type SelectOption,
} from "panther";
import { type JSX, Show } from "solid-js";

const GRAIN_OPTIONS = (): SelectOption<GridGrain>[] => [
  { value: "period_id", label: t3({ en: "Month", fr: "Mois", pt: "Mês" }) },
  {
    value: "quarter_id",
    label: t3({ en: "Quarter", fr: "Trimestre", pt: "Trimestre" }),
  },
  { value: "year", label: t3({ en: "Year", fr: "Année", pt: "Ano" }) },
];

// The Data table's controls, after the view selector. Each edits the query
// through `onChange`; the query shown is the resolved one, so every control
// shows what is read.
export function Toolbar(p: {
  viewSelect: JSX.Element;
  columns: GridColumns;
  query: GridQuery;
  levelOptions: SelectOption<AdminLevel>[];
  stratOptions: SelectOption<string>[];
  indicatorOptions: SelectOption<string>[];
  periodChoices: GridPeriodChoice[];
  onChange: (patch: Partial<GridQuery>) => void;
  find: string;
  onFind: (find: string) => void;
  onDownload: (() => void) | undefined;
}) {
  const setPeriod = (id: string) => {
    const choice = p.periodChoices.find((c) => c.id === id);
    if (choice !== undefined) p.onChange({ period: choice.period });
  };

  return (
    <div class="ui-gap-sm flex flex-wrap items-end">
      {p.viewSelect}
      <Show
        when={p.query.unit.kind === "admin" ? p.query.unit : undefined}
        keyed
        fallback={
          <Select
            value={p.query.unit.kind === "strat" ? p.query.unit.strat : undefined}
            options={p.stratOptions}
            onChange={(strat) => p.onChange({ unit: { kind: "strat", strat } })}
            size="sm"
          />
        }
      >
        {(unit) => (
          <Select
            value={unit.level}
            options={p.levelOptions}
            onChange={(level) => p.onChange({ unit: { kind: "admin", level } })}
            disabled={p.levelOptions.length === 0}
            size="sm"
          />
        )}
      </Show>
      <div class="w-64">
        <MultiSelectSearch
          values={p.query.indicators}
          options={p.indicatorOptions}
          onChange={(indicators) => p.onChange({ indicators })}
          placeholder={t3({
            en: `All indicators (${p.indicatorOptions.length})`,
            fr: `Tous les indicateurs (${p.indicatorOptions.length})`,
            pt: `Todos os indicadores (${p.indicatorOptions.length})`,
          })}
          fullWidth
          size="sm"
        />
      </div>
      <Select
        value={periodChoiceId(p.query.period, p.periodChoices)}
        options={p.periodChoices.map((c) => ({ value: c.id, label: c.label }))}
        onChange={setPeriod}
        placeholder={t3({
          en: "Chosen periods",
          fr: "Périodes choisies",
          pt: "Períodos escolhidos",
        })}
        size="sm"
      />
      <Show when={p.query.family === "hmis" && p.columns === "time"}>
        <Select
          value={p.query.grain}
          options={GRAIN_OPTIONS()}
          onChange={(grain) => p.onChange({ grain })}
          size="sm"
        />
      </Show>
      <div class="ml-auto w-48">
        <Input
          value={p.find}
          onChange={p.onFind}
          placeholder={t3({
            en: "Find column",
            fr: "Chercher une colonne",
            pt: "Procurar coluna",
          })}
          searchIcon
          clearable
          fullWidth
          size="sm"
        />
      </div>
      <Button
        onClick={() => p.onDownload?.()}
        disabled={p.onDownload === undefined}
        size="sm"
        outline
        iconName="download"
      >
        {t3({ en: "Download", fr: "Télécharger", pt: "Transferir" })}
      </Button>
    </div>
  );
}
