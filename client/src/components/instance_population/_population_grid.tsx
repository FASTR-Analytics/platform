import {
  ADMIN_AREA_COLUMNS,
  POPULATION_TYPES,
  populationTypeLabel,
  populationYearRangeLabel,
  t3,
  TC,
  type PopulationGridArea,
  type AdminAreaLevel,
  type PopulationTypeStore,
} from "lib";
import {
  Button,
  Csv,
  FrameLeft,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  TableFromCsv,
  TabsNavigation,
  createDeleteAction,
  toNum0,
  type ListItem,
  type StateHolder,
} from "panther";
import { Show, createEffect, createMemo, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { getPopulationTypeStoreFromCacheOrFetch } from "~/state/instance/t2_population";

type Props = {
  canConfigure: boolean;
};

export function PopulationGrid(p: Props) {
  const [selectedType, setSelectedType] = createSignal<string | undefined>(
    undefined,
  );
  const coverageFor = (populationType: string) =>
    instanceState.populationCoverage.find(
      (c) => c.populationType === populationType,
    );
  const activeType = createMemo(
    () =>
      selectedType() ??
      POPULATION_TYPES.find((t) => coverageFor(t.id) !== undefined)?.id ??
      POPULATION_TYPES[0].id,
  );
  const tabItems = createMemo<ListItem<string>[]>(() =>
    POPULATION_TYPES.map((t) => {
      const coverage = coverageFor(t.id);
      return {
        id: t.id,
        label: t3(t.label),
        dot:
          coverage === undefined
            ? undefined
            : coverage.complete
              ? "success"
              : "danger",
      };
    }),
  );

  return (
    <FrameLeft
      panelChildren={
        <div class="h-full">
          <TabsNavigation
            vertical
            items={tabItems()}
            value={activeType()}
            onChange={setSelectedType}
          />
        </div>
      }
    >
      <Show when={activeType()} keyed>
        {(populationType) => (
          <PopulationTypeGrid
            populationType={populationType}
            canConfigure={p.canConfigure}
          />
        )}
      </Show>
    </FrameLeft>
  );
}

function gridCsv(
  level: AdminAreaLevel,
  years: number[],
  areas: PopulationGridArea[],
): Csv<string> {
  const colHeaders = [
    ...ADMIN_AREA_COLUMNS.slice(0, level),
    ...years.map(String),
  ];
  const aoa = areas.map((area) => [
    ...area.names,
    ...years.map((year) => {
      const value = area.cells[String(year)];
      return value === undefined ? "" : toNum0(value);
    }),
  ]);
  return new Csv({ aoa, colHeaders });
}

// Gaps against the structure, from the grid's own rows so the strip and the
// table cannot disagree. An area with any value counts as having data.
function CoverageStrip(p: { years: number[]; areas: PopulationGridArea[] }) {
  const total = () => p.areas.length;
  const withData = () =>
    p.areas.filter((a) => Object.keys(a.cells).length > 0).length;
  const yearsWithGaps = createMemo(() =>
    p.years.filter((year) =>
      p.areas.some((a) => a.cells[String(year)] === undefined),
    ),
  );
  const text = () => {
    if (yearsWithGaps().length === 0) {
      return t3({
        en: `All ${toNum0(total())} areas have a value for every year.`,
        fr: `Les ${toNum0(total())} unités ont une valeur pour chaque année.`,
        pt: `Todas as ${toNum0(total())} zonas têm um valor para todos os anos.`,
      });
    }
    const areas = t3({
      en: `Areas with data: ${toNum0(withData())} of ${toNum0(total())}.`,
      fr: `Unités avec données : ${toNum0(withData())} sur ${toNum0(total())}.`,
      pt: `Zonas com dados: ${toNum0(withData())} de ${toNum0(total())}.`,
    });
    const years =
      yearsWithGaps().length === p.years.length
        ? t3({
            en: "Every year has gaps.",
            fr: "Chaque année a des lacunes.",
            pt: "Todos os anos têm lacunas.",
          })
        : t3({
            en: `Years with gaps: ${yearsWithGaps().join(", ")}.`,
            fr: `Années avec lacunes : ${yearsWithGaps().join(", ")}.`,
            pt: `Anos com lacunas: ${yearsWithGaps().join(", ")}.`,
          });
    return `${areas} ${years}`;
  };
  return (
    <div class="ui-pad text-base-content-muted flex-none border-b text-sm">
      {text()}
    </div>
  );
}

function PopulationTypeGrid(p: {
  populationType: string;
  canConfigure: boolean;
}) {
  const typeLabel = () => t3(populationTypeLabel(p.populationType));
  const coverage = () =>
    instanceState.populationCoverage.find(
      (c) => c.populationType === p.populationType,
    );

  const [store, setStore] = createSignal<StateHolder<PopulationTypeStore>>({
    status: "loading",
    msg: t3(TC.fetchingData),
  });
  let requestCounter = 0;
  createEffect(async () => {
    const populationType = p.populationType;
    const populationLastUpdated = instanceState.populationLastUpdated;
    const structureLastUpdated = instanceState.structureLastUpdated;
    const requestId = ++requestCounter;
    setStore({ status: "loading", msg: t3(TC.fetchingData) });
    const res = await getPopulationTypeStoreFromCacheOrFetch(
      populationType,
      populationLastUpdated,
      structureLastUpdated,
    );
    if (requestId !== requestCounter) return;
    setStore(
      res.success
        ? { status: "ready", data: res.data }
        : { status: "error", err: res.err },
    );
  });

  const yearRange = () => {
    const c = coverage();
    return c === undefined || c.yearCount === 0
      ? ""
      : populationYearRangeLabel(c);
  };

  const deleteTypeData = createDeleteAction(
    {
      text: t3({
        en: "Delete every stored value of this population type, for every year and area? Other population types are kept.",
        fr: "Supprimer toutes les valeurs enregistrées de ce type de population, pour toutes les années et unités ? Les autres types de population sont conservés.",
        pt: "Eliminar todos os valores guardados deste tipo de população, para todos os anos e zonas? Os outros tipos de população são mantidos.",
      }),
      itemList: [typeLabel()],
    },
    () =>
      serverActions.deletePopulationTypeData({
        populationType: p.populationType,
      }),
  );

  const blankAsDot = (str: string) => (str === "" ? "." : str);

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading={typeLabel()} subheading={yearRange()}>
          <Show when={p.canConfigure}>
            <Button
              iconName="trash"
              intent="danger"
              outline
              size="sm"
              onClick={deleteTypeData.click}
            />
          </Show>
        </HeadingBar>
      }
    >
      <StateHolderWrapper state={store()}>
        {(data) => (
          <Show
            when={data.populationLevel !== undefined && data.years.length > 0}
            fallback={
              <div class="ui-pad text-base-content-faint">
                {t3({
                  en: "No data for this population type",
                  fr: "Aucune donnée pour ce type de population",
                  pt: "Sem dados para este tipo de população",
                })}
              </div>
            }
          >
            <Show when={data.populationLevel} keyed>
              {(level) => {
                const structureAreas = createMemo(() =>
                  data.areas.filter((a) => !a.stale),
                );
                const staleAreas = createMemo(() =>
                  data.areas.filter((a) => a.stale),
                );
                return (
                  <div class="flex h-full w-full flex-col">
                    <CoverageStrip
                      years={data.years}
                      areas={structureAreas()}
                    />
                    <div class="min-h-0 flex-1">
                      <TableFromCsv
                        csv={gridCsv(level, data.years, structureAreas())}
                        knownTotalCount={structureAreas().length}
                        maxRows={structureAreas().length}
                        cellFormatter={blankAsDot}
                        alignText="left"
                        unsorted
                      />
                    </div>
                    <Show when={staleAreas().length > 0}>
                      <div class="flex h-72 flex-none flex-col border-t">
                        <div class="ui-pad flex-none text-sm">
                          <span class="font-700">
                            {t3({
                              en: "Areas no longer in the HMIS structure",
                              fr: "Unités absentes de la structure SNIS",
                              pt: "Zonas que já não estão na estrutura SNIS",
                            })}
                          </span>{" "}
                          <span class="text-base-content-muted">
                            {t3({
                              en: "These rows are kept and exported but never count towards completeness.",
                              fr: "Ces lignes sont conservées et exportées, mais ne comptent jamais pour la complétude.",
                              pt: "Estas linhas são mantidas e exportadas, mas nunca contam para a completude.",
                            })}
                          </span>
                        </div>
                        <div class="min-h-0 flex-1">
                          <TableFromCsv
                            csv={gridCsv(level, data.years, staleAreas())}
                            knownTotalCount={staleAreas().length}
                            maxRows={staleAreas().length}
                            cellFormatter={blankAsDot}
                            alignText="left"
                            unsorted
                          />
                        </div>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </Show>
          </Show>
        )}
      </StateHolderWrapper>
    </FrameTop>
  );
}
