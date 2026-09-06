// One population type at a time: a vertical tab per type on the left; on the
// right its values as the app's other data pages show a dataset, a
// TableFromCsv in the export CSV's column order (admin_area_1 down to the
// population level, then one column per year). Structure areas fill the main
// table; rows for areas no longer in the structure, when any, get their own
// table below it. The coverage line comes from T1, the cells from the T2
// type-grid cache.

import {
  POPULATION_TYPES,
  populationTypeLabel,
  t3,
  TC,
  type PopulationGridArea,
  type PopulationLevel,
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
import { getAdminAreaLabel } from "~/state/instance/_util_disaggregation_label";
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
  // The selection survives a vocabulary change only while its type exists;
  // otherwise the first type with data, else the first type.
  // The first type with data until the user picks one.
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
        dot: coverage === undefined
          ? undefined
          : coverage.complete
          ? "success"
          : "danger",
      };
    })
  );

  return (
    <FrameLeft
      panelChildren={
        <div class="h-full w-64">
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

const ADMIN_AREA_COLUMNS = [
  "admin_area_1",
  "admin_area_2",
  "admin_area_3",
  "admin_area_4",
] as const;

function gridCsv(
  level: PopulationLevel,
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

function PopulationTypeGrid(p: { populationType: string; canConfigure: boolean }) {
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

  const levelLabel = () => {
    const level = instanceState.populationLevel;
    return level === null ? "" : t3(getAdminAreaLabel(level));
  };

  const coverageText = createMemo(() => {
    const c = coverage();
    const parts = [levelLabel()];
    if (c === undefined || c.yearCount === 0) {
      parts.push(t3({ en: "no data", fr: "aucune donnée", pt: "sem dados" }));
    } else {
      parts.push(
        c.firstYear === c.lastYear
          ? `${c.firstYear}`
          : `${c.firstYear}–${c.lastYear}`,
      );
      parts.push(
        t3({
          en: `${toNum0(c.areaCount)} of ${toNum0(c.structureAreaCount)} areas`,
          fr: `${toNum0(c.areaCount)} unités sur ${toNum0(c.structureAreaCount)}`,
          pt: `${toNum0(c.areaCount)} de ${toNum0(c.structureAreaCount)} zonas`,
        }),
      );
      parts.push(
        c.complete
          ? t3({ en: "complete", fr: "complet", pt: "completo" })
          : t3({
            en: `incomplete: ${c.incompleteYears.join(", ")}`,
            fr: `incomplet : ${c.incompleteYears.join(", ")}`,
            pt: `incompleto: ${c.incompleteYears.join(", ")}`,
          }),
      );
    }
    return parts.filter((s) => s !== "").join(" · ");
  });

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
        <HeadingBar heading={typeLabel()} subheading={coverageText()}>
          <Show when={p.canConfigure}>
            <Button
              iconName="trash"
              intent="danger"
              outline
              size="sm"
              onClick={deleteTypeData.click}
            >
              {t3({
                en: `Delete all “${typeLabel()}” data`,
                fr: `Supprimer toutes les données « ${typeLabel()} »`,
                pt: `Eliminar todos os dados «${typeLabel()}»`,
              })}
            </Button>
          </Show>
        </HeadingBar>
      }
    >
      <StateHolderWrapper state={store()}>
        {(data) => (
          <Show
            when={data.populationLevel !== null && data.years.length > 0}
            fallback={
              <div class="ui-pad">
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
                const structureAreas = () =>
                  data.areas.filter((a) => !a.stale);
                const staleAreas = () => data.areas.filter((a) => a.stale);
                return (
                  <div class="flex h-full w-full flex-col">
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
