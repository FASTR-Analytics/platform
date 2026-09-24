import {
  t3,
  type AdminLevel,
  type GridColumns,
  type GridPeriodChoice,
  type GridQuery,
} from "lib";
import { Button, Input, Select, type SelectOption } from "panther";
import { type JSX, Show } from "solid-js";
import {
  GrainControl,
  IndicatorsControl,
  PeriodControl,
} from "../_shared/mod.ts";

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
      <IndicatorsControl
        values={p.query.indicators}
        options={p.indicatorOptions}
        onChange={(indicators) => p.onChange({ indicators })}
      />
      <PeriodControl
        period={p.query.period}
        choices={p.periodChoices}
        onChange={(period) => p.onChange({ period })}
      />
      <Show when={p.query.family === "hmis" && p.columns === "time"}>
        <GrainControl
          value={p.query.grain}
          onChange={(grain) => p.onChange({ grain })}
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
