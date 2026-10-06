import {
  type ExploreLevel,
  type FamilyQuery,
  type ResolvedView,
  t3,
} from "lib";
import { Button, Input, Select, type SelectOption } from "panther";
import { type JSX, Show } from "solid-js";
import {
  GrainControl,
  IndicatorsControl,
  PeriodControl,
} from "../_shared/mod.ts";

// The Data table's controls: the page's selectors with find and Download on
// the top row, the query controls beneath, each from a role of the resolved
// view, so every control shows what is read.
export function Toolbar(p: {
  selectors: JSX.Element;
  view: ResolvedView;
  levelOptions: SelectOption<ExploreLevel>[];
  onChange: (patch: Partial<FamilyQuery>) => void;
  onCategoryChange: (ids: string[]) => void;
  find: string;
  onFind: (find: string) => void;
  onDownload: (() => void) | undefined;
}) {
  return (
    <div class="ui-spy-sm">
      <div class="ui-gap-sm flex flex-wrap items-center">
        {p.selectors}
        <div class="ui-gap-sm ml-auto flex items-center">
          <div class="w-48">
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
      </div>
      <div class="ui-gap-sm flex flex-wrap items-end">
        <Show when={p.view.area}>
          {(area) => (
            <Select
              value={area().level}
              options={p.levelOptions}
              onChange={(level) => p.onChange({ level })}
              disabled={p.levelOptions.length === 0}
              size="sm"
            />
          )}
        </Show>
        <Show
          when={p.view.category?.placement === "laid_out"
            ? p.view.category
            : undefined}
        >
          {(category) => (
            <IndicatorsControl
              values={category().values}
              options={category().options.map((o) => ({
                value: o.id,
                label: o.label,
              }))}
              onChange={p.onCategoryChange}
            />
          )}
        </Show>
        <Show when={p.view.time}>
          {(time) => (
            <PeriodControl
              period={p.view.query.period}
              choices={time().choices}
              onChange={(period) => p.onChange({ period })}
            />
          )}
        </Show>
        <Show when={p.view.time?.grainShown}>
          <GrainControl
            value={p.view.query.grain}
            onChange={(grain) => p.onChange({ grain })}
          />
        </Show>
      </div>
    </div>
  );
}
