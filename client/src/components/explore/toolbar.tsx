import {
  type DatasetType,
  type DisaggregationOption,
  type ExploreGrain,
  type ExploreLevel,
  type ExplorePeriod,
  type ExplorePeriodChoice,
  type ExplorePin,
  type FamilyQuery,
  periodChoiceId,
  type ResolvedView,
  t3,
} from "lib";
import {
  Button,
  Input,
  MultiSelectSearch,
  Select,
  type SelectOption,
} from "panther";
import { For, type JSX, Match, Show, Switch } from "solid-js";
import { getDisplayDisaggregationLabel } from "~/state/instance/_util_disaggregation_label";

const NATIONAL_LABEL = { en: "National", fr: "National", pt: "Nacional" };

// The frame's toolbar, from the roles of the resolved view. Top row: the
// page's selectors (module, view, type) and the table's tools at the right.
// Second row: the switch, the level, each pinned dimension, the category
// (a multi-select when laid out; pinned, it is among the pins), the period
// and the grain. A control appears only when its role is present and its
// options number more than one, except the level and period selects, which
// always appear with their role. A pinned dimension over the server's cap
// shows the cap message where its select would be (R13). Every control
// shows the resolved value, so it shows what is read.
export function Toolbar(p: {
  selectors: JSX.Element;
  tools: JSX.Element;
  view: ResolvedView;
  family: DatasetType;
  onQuery: (patch: Partial<FamilyQuery>) => void;
  onCategory: (ids: string[]) => void;
  onSwitch: (id: string) => void;
  onPin: (dimension: DisaggregationOption, value: string) => void;
  onClearDropped: () => void;
}) {
  const levelOptions = (levels: ExploreLevel[]): SelectOption<ExploreLevel>[] =>
    levels.map((level) => ({
      value: level,
      label: level === "national"
        ? t3(NATIONAL_LABEL)
        : t3(getDisplayDisaggregationLabel(level, p.family)),
    }));

  return (
    <div class="ui-spy-sm">
      <div class="ui-gap-sm flex flex-wrap items-center">
        {p.selectors}
        <div class="ui-gap-sm ml-auto flex items-center">{p.tools}</div>
      </div>
      <div class="ui-gap-sm flex flex-wrap items-end">
        <Show
          when={(p.view.switch?.options.length ?? 0) > 1
            ? p.view.switch
            : undefined}
        >
          {(sw) => (
            <Select
              value={sw().value}
              options={sw().options.map((o) => ({
                value: o.id,
                label: t3(o.label),
              }))}
              onChange={p.onSwitch}
              label={t3(sw().label)}
              size="sm"
            />
          )}
        </Show>
        <Show when={p.view.area}>
          {(area) => (
            <Select
              value={area().level}
              options={levelOptions(area().levels)}
              onChange={(level) => p.onQuery({ level })}
              disabled={area().levels.length === 0}
              size="sm"
            />
          )}
        </Show>
        <For each={p.view.pins}>
          {(pin) => (
            <Switch>
              <Match when={pin.status === "too_many_values"}>
                <CapMessage pin={pin} family={p.family} />
              </Match>
              <Match when={pin.options.length > 1}>
                <Select
                  value={pin.value}
                  options={pin.options.map((o) => ({
                    value: o.id,
                    label: o.label,
                  }))}
                  onChange={(value) => p.onPin(pin.dimension, value)}
                  size="sm"
                />
              </Match>
            </Switch>
          )}
        </For>
        <Show
          when={p.view.category?.placement === "laid_out" &&
              p.view.category.options.length > 1
            ? p.view.category
            : undefined}
        >
          {(category) => (
            <div class="w-64">
              <MultiSelectSearch
                values={category().values}
                options={category().options.map((o) => ({
                  value: o.id,
                  label: o.label,
                }))}
                onChange={p.onCategory}
                placeholder={categoryPlaceholder(category(), p.family)}
                fullWidth
                size="sm"
              />
            </div>
          )}
        </Show>
        <Show when={p.view.time}>
          {(time) => (
            <PeriodControl
              period={p.view.query.period}
              choices={time().choices}
              onChange={(period) => p.onQuery({ period })}
            />
          )}
        </Show>
        <Show when={p.view.time?.grainShown}>
          <GrainControl
            value={p.view.query.grain}
            onChange={(grain) => p.onQuery({ grain })}
          />
        </Show>
      </div>
      <Show when={p.view.droppedIndicators.length > 0}>
        <div class="ui-gap-sm flex items-center text-sm">
          <span class="text-base-content-muted">
            {t3({
              en:
                `${p.view.droppedIndicators.length} chosen indicator(s) are not in this package.`,
              fr:
                `${p.view.droppedIndicators.length} indicateur(s) choisi(s) ne figurent pas dans ce paquet.`,
              pt:
                `${p.view.droppedIndicators.length} indicador(es) escolhido(s) não estão neste pacote.`,
            })}
          </span>
          <Button onClick={p.onClearDropped} size="sm" outline>
            {t3({ en: "Clear", fr: "Effacer", pt: "Limpar" })}
          </Button>
        </div>
      </Show>
    </div>
  );
}

// Empty means all. The family's indicators are named as such; any other
// category is named by its dimension.
function categoryPlaceholder(
  category: NonNullable<ResolvedView["category"]>,
  family: DatasetType,
): string {
  const n = category.options.length;
  if (category.isIndicator) {
    return t3({
      en: `All indicators (${n})`,
      fr: `Tous les indicateurs (${n})`,
      pt: `Todos os indicadores (${n})`,
    });
  }
  const label = t3(getDisplayDisaggregationLabel(category.dimension, family));
  return t3({
    en: `${label}: all (${n})`,
    fr: `${label} : tout (${n})`,
    pt: `${label}: tudo (${n})`,
  });
}

// The table's find box and Download, placed at the right of the top row.
export function TableTools(p: {
  find: string;
  onFind: (find: string) => void;
  onDownload: (() => void) | undefined;
}) {
  return (
    <>
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
    </>
  );
}

// The same limit the editor's replicant list states inline.
function CapMessage(p: { pin: ExplorePin; family: DatasetType }) {
  const label = () =>
    t3(getDisplayDisaggregationLabel(p.pin.dimension, p.family));
  return (
    <div class="text-base-content-muted w-48 text-sm">
      {t3({
        en: `Too many ${label()} values (over 500). Choose a narrower scope.`,
        fr:
          `Trop de valeurs de ${label()} (plus de 500). Choisissez une portée plus restreinte.`,
        pt:
          `Demasiados valores de ${label()} (mais de 500). Escolha um âmbito mais restrito.`,
      })}
    </div>
  );
}

function PeriodControl(p: {
  period: ExplorePeriod;
  choices: ExplorePeriodChoice[];
  onChange: (period: ExplorePeriod) => void;
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

const GRAIN_OPTIONS = (): SelectOption<ExploreGrain>[] => [
  { value: "period_id", label: t3({ en: "Month", fr: "Mois", pt: "Mês" }) },
  {
    value: "quarter_id",
    label: t3({ en: "Quarter", fr: "Trimestre", pt: "Trimestre" }),
  },
  { value: "year", label: t3({ en: "Year", fr: "Année", pt: "Ano" }) },
];

function GrainControl(p: {
  value: ExploreGrain;
  onChange: (grain: ExploreGrain) => void;
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
