// The values of one population type as a grid: structure areas at the
// population level down (stale areas appended), years across. One vertical
// tab per type on the left; the coverage line in the heading comes from T1,
// the cells from the T2 type-store cache.

import {
  t3,
  TC,
  type PopulationGridArea,
  type PopulationTypeStore,
} from "lib";
import {
  Button,
  FrameLeft,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  Table,
  TabsNavigation,
  createDeleteAction,
  toNum0,
  type ListItem,
  type StateHolder,
  type TableColumn,
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
  const activeType = createMemo(() => {
    const types = instanceState.populationTypes;
    const selected = selectedType();
    if (selected !== undefined && types.some((t) => t.id === selected)) {
      return selected;
    }
    return (types.find((t) => coverageFor(t.id) !== undefined) ?? types.at(0))
      ?.id;
  });
  const tabItems = createMemo<ListItem<string>[]>(() =>
    instanceState.populationTypes.map((t) => {
      const coverage = coverageFor(t.id);
      return {
        id: t.id,
        label: t.label,
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
        <div class="h-full">
          <TabsNavigation
            vertical
            items={tabItems()}
            value={activeType() ?? ""}
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

// Mounted per type (the parent keys on it), so mount-time defaults are per
// type.
function PopulationTypeGrid(p: { populationType: string; canConfigure: boolean }) {
  const typeLabel = () =>
    instanceState.populationTypes.find((t) => t.id === p.populationType)
      ?.label ?? p.populationType;
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
    if (c !== undefined && c.staleRowCount > 0) {
      parts.push(
        t3({
          en: `${toNum0(c.staleRowCount)} rows for areas no longer in the structure`,
          fr: `${toNum0(c.staleRowCount)} lignes pour des unités absentes de la structure`,
          pt: `${toNum0(c.staleRowCount)} linhas de zonas que já não estão na estrutura`,
        }),
      );
    }
    return parts.filter((s) => s !== "").join(" · ");
  });

  const areas = createMemo<PopulationGridArea[]>(() => {
    const s = store();
    return s.status === "ready" ? s.data.areas : [];
  });

  const columns = createMemo<TableColumn<PopulationGridArea>[]>(() => {
    const s = store();
    const years = s.status === "ready" ? s.data.years : [];
    return [
      {
        key: "path",
        header: levelLabel(),
        render: (area) => (
          <span classList={{ "text-base-content-muted": area.stale }}>
            {area.path}
            <Show when={area.stale}>
              {" "}
              {t3({
                en: "(not in the structure)",
                fr: "(absente de la structure)",
                pt: "(fora da estrutura)",
              })}
            </Show>
          </span>
        ),
      },
      ...years.map((year): TableColumn<PopulationGridArea> => ({
        key: String(year),
        header: String(year),
        alignH: "right",
        render: (area) => {
          const value = area.cells[String(year)];
          return value === undefined
            ? <span class="text-danger">·</span>
            : <span class="font-mono">{toNum0(value)}</span>;
        },
      })),
    ];
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

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading={typeLabel()} subheading={coverageText()}>
          <div class="ui-gap flex items-center">
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
          </div>
        </HeadingBar>
      }
    >
      <StateHolderWrapper state={store()} noPad>
        {(data) => (
          <Show
            when={data.years.length > 0}
            fallback={
              <div class="ui-pad text-base-content-muted text-sm">
                {t3({
                  en: "No data for this population type.",
                  fr: "Aucune donnée pour ce type de population.",
                  pt: "Sem dados para este tipo de população.",
                })}
              </div>
            }
          >
            <div class="ui-pad h-full">
              <Table
                data={areas()}
                columns={columns()}
                keyField="key"
                noRowsMessage={t3({
                  en: "No areas",
                  fr: "Aucune unité",
                  pt: "Sem zonas",
                })}
                fitTableToAvailableHeight
                paddingY="compact"
              />
            </div>
          </Show>
        )}
      </StateHolderWrapper>
    </FrameTop>
  );
}
