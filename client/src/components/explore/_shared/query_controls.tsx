import {
  periodChoiceId,
  t3,
  type DatasetType,
  type GridGrain,
  type GridPeriod,
  type GridPeriodChoice,
  type GridQuery,
  type ResolvedGridQuery,
  type RunAuthoringContext,
} from "lib";
import { Button, MultiSelectSearch, Select, type SelectOption } from "panther";

// The query controls the Explore views share, each editing one field of the
// family's GridQuery.

export function indicatorOptions(
  family: DatasetType,
  ctx: RunAuthoringContext,
): SelectOption<string>[] {
  const entries = family === "hmis"
    ? ctx.hmisIndicators
    : family === "hfa"
    ? ctx.hfaTaxonomy.indicators
    : ctx.icehIndicators;
  return entries.map((i) => ({ value: i.id, label: i.label }));
}

// Editors over the family's query. `update` keeps the indicators the package
// lacks, so a choice survives a package switch; `clearDropped` forgets them.
export function queryEditors(
  intent: () => GridQuery,
  resolved: () => ResolvedGridQuery,
  setQuery: (query: GridQuery) => void,
) {
  return {
    update: (patch: Partial<GridQuery>) =>
      setQuery({
        ...intent(),
        ...patch,
        ...(patch.indicators === undefined ? {} : {
          indicators: [...patch.indicators, ...resolved().droppedIndicators],
        }),
      }),
    clearDropped: () => {
      const dropped = new Set(resolved().droppedIndicators);
      setQuery({
        ...intent(),
        indicators: intent().indicators.filter((id) => !dropped.has(id)),
      });
    },
  };
}

export function IndicatorsControl(p: {
  values: string[];
  options: SelectOption<string>[];
  onChange: (indicators: string[]) => void;
}) {
  return (
    <div class="w-64">
      <MultiSelectSearch
        values={p.values}
        options={p.options}
        onChange={p.onChange}
        placeholder={t3({
          en: `All indicators (${p.options.length})`,
          fr: `Tous les indicateurs (${p.options.length})`,
          pt: `Todos os indicadores (${p.options.length})`,
        })}
        fullWidth
        size="sm"
      />
    </div>
  );
}

export function PeriodControl(p: {
  period: GridPeriod;
  choices: GridPeriodChoice[];
  onChange: (period: GridPeriod) => void;
}) {
  return (
    <Select
      value={periodChoiceId(p.period, p.choices)}
      options={p.choices.map((c) => ({ value: c.id, label: c.label }))}
      onChange={(id) => {
        const choice = p.choices.find((c) => c.id === id);
        if (choice !== undefined) p.onChange(choice.period);
      }}
      placeholder={t3({
        en: "Chosen periods",
        fr: "Périodes choisies",
        pt: "Períodos escolhidos",
      })}
      size="sm"
    />
  );
}

const GRAIN_OPTIONS = (): SelectOption<GridGrain>[] => [
  { value: "period_id", label: t3({ en: "Month", fr: "Mois", pt: "Mês" }) },
  {
    value: "quarter_id",
    label: t3({ en: "Quarter", fr: "Trimestre", pt: "Trimestre" }),
  },
  { value: "year", label: t3({ en: "Year", fr: "Année", pt: "Ano" }) },
];

export function GrainControl(p: {
  value: GridGrain;
  onChange: (grain: GridGrain) => void;
}) {
  return (
    <Select
      value={p.value}
      options={GRAIN_OPTIONS()}
      onChange={p.onChange}
      size="sm"
    />
  );
}

export function DroppedIndicatorsNotice(p: {
  count: number;
  onClear: () => void;
}) {
  return (
    <div class="ui-gap-sm flex items-center text-sm">
      <span class="text-base-content-muted">
        {t3({
          en: `${p.count} chosen indicator(s) are not in this package.`,
          fr: `${p.count} indicateur(s) choisi(s) ne figurent pas dans ce paquet.`,
          pt: `${p.count} indicador(es) escolhido(s) não estão neste pacote.`,
        })}
      </span>
      <Button onClick={p.onClear} size="sm" outline>
        {t3({ en: "Clear", fr: "Effacer", pt: "Limpar" })}
      </Button>
    </div>
  );
}
