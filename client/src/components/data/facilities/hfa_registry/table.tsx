import {
  getEnabledOptionalFacilityColumns,
  hashStructureSchema,
  type HfaRegistryFacility,
  t3,
  TC,
} from "lib";
import {
  createTableConfig,
  openComponent,
  type StateHolder,
  StateHolderWrapper,
  Table,
  type TableColumn,
} from "panther";
import { createEffect, createSignal } from "solid-js";
import { getAdminAreaLabelForLevel } from "~/state/instance/_util_disaggregation_label";
import {
  instanceState,
  structureSchemaForFamily,
} from "~/state/instance/t1_store";
import { getHfaRegistryFromCacheOrFetch } from "~/state/instance/t2_structure";
import {
  hfaFacilityColumnLabel,
  hfaFacilitySourceLabel,
} from "../../_shared/mod.ts";
import { EditHfaFacility } from "./edit_facility.tsx";
import { alertHfaRegistryOrphans } from "./orphans_alert.tsx";

// The HFA registry with who set each facility's admin areas and type. A
// global admin edits a facility by clicking its row.
export function HfaRegistryTable() {
  const [registry, setRegistry] = createSignal<
    StateHolder<HfaRegistryFacility[]>
  >({ status: "loading", msg: t3(TC.fetchingData) });
  const tableConfig = createTableConfig();

  let fetchRunId = 0;
  async function fetchRegistry(
    structureLastUpdated: string,
    hfaCacheHash: string,
    schemaHash: string,
  ) {
    const runId = ++fetchRunId;
    setRegistry({ status: "loading", msg: t3(TC.fetchingData) });
    const res = await getHfaRegistryFromCacheOrFetch(
      structureLastUpdated,
      hfaCacheHash,
      schemaHash,
    );
    if (runId !== fetchRunId) {
      return;
    }
    setRegistry(
      res.success
        ? { status: "ready", data: res.data }
        : { status: "error", err: res.err },
    );
  }

  createEffect(() => {
    const structureLastUpdated = instanceState.structureLastUpdated;
    const hfaCacheHash = instanceState.hfaCacheHash;
    const schemaHash = hashStructureSchema(structureSchemaForFamily("hfa"));
    if (!structureLastUpdated) {
      setRegistry({
        status: "error",
        err: t3({
          en: "No structure data",
          fr: "Aucune donnée de structure",
          pt: "Nenhum dado de estrutura",
        }),
      });
      return;
    }
    void fetchRegistry(structureLastUpdated, hfaCacheHash, schemaHash);
  });

  const schema = () => structureSchemaForFamily("hfa");
  const enabled = () => getEnabledOptionalFacilityColumns(schema());

  function columns(): TableColumn<HfaRegistryFacility>[] {
    const adminLevels = Array.from(
      { length: schema().adminDepth - 1 },
      (_, i) => i + 2,
    );
    const typeSource: TableColumn<HfaRegistryFacility>[] =
      enabled().includes("facility_type")
        ? [{
          key: "typeSource",
          header: t3({
            en: `${hfaFacilityColumnLabel("facility_type")}: set by`,
            fr: `${hfaFacilityColumnLabel("facility_type")} : défini par`,
            pt: `${hfaFacilityColumnLabel("facility_type")}: definido por`,
          }),
          filterable: true,
          filterValue: (r) => hfaFacilitySourceLabel(r.sources.facility_type),
          render: (r) => (
            <span>{hfaFacilitySourceLabel(r.sources.facility_type)}</span>
          ),
        }]
        : [];
    return [
      {
        key: "facilityId",
        header: t3({
          en: "Facility ID",
          fr: "Identifiant",
          pt: "Identificador",
        }),
        sortable: true,
        render: (r) => <span class="font-mono">{r.facilityId}</span>,
      },
      ...adminLevels.map((level): TableColumn<HfaRegistryFacility> => ({
        key: `admin_area_${level}`,
        header: t3(getAdminAreaLabelForLevel(level)),
        sortable: true,
        filterable: true,
        sortValue: (r) => r.admin[level - 1],
        filterValue: (r) => r.admin[level - 1],
        render: (r) => <span>{r.admin[level - 1]}</span>,
      })),
      {
        key: "adminSource",
        header: t3({
          en: "Admin areas: set by",
          fr: "Unités administratives : définies par",
          pt: "Zonas administrativas: definidas por",
        }),
        filterable: true,
        filterValue: (r) => hfaFacilitySourceLabel(r.sources.admin),
        render: (r) => <span>{hfaFacilitySourceLabel(r.sources.admin)}</span>,
      },
      ...enabled().map((column): TableColumn<HfaRegistryFacility> => ({
        key: column,
        header: hfaFacilityColumnLabel(column),
        sortable: true,
        filterable: column !== "facility_name",
        sortValue: (r) => r.optional[column] ?? "",
        filterValue: (r) => r.optional[column] ?? "",
        render: (r) => <span>{r.optional[column] ?? ""}</span>,
      })),
      ...typeSource,
    ];
  }

  async function editFacility(
    facility: HfaRegistryFacility,
    rows: HfaRegistryFacility[],
  ) {
    const areaNames = new Map<number, Set<string>>();
    for (const row of rows) {
      row.admin.forEach((name, i) => {
        const names = areaNames.get(i + 1) ?? new Set<string>();
        names.add(name);
        areaNames.set(i + 1, names);
      });
    }
    const result = await openComponent({
      element: EditHfaFacility,
      props: { facility, enabled: enabled(), areaNames },
    });
    if (result) {
      await alertHfaRegistryOrphans(result);
    }
  }

  return (
    <StateHolderWrapper state={registry()} loadingAndErrorPad="md">
      {(rows) => (
        <Table
          config={tableConfig}
          data={rows}
          columns={columns()}
          keyField="facilityId"
          itemLabel={{
            one: t3({
              en: "facility",
              fr: "établissement",
              pt: "estabelecimento",
            }),
            other: t3({
              en: "facilities",
              fr: "établissements",
              pt: "estabelecimentos",
            }),
          }}
          toolbar={{ search: true, nested: true }}
          onRowClick={instanceState.currentUserIsGlobalAdmin
            ? (facility) => void editFacility(facility, rows)
            : undefined}
          paddingY="compact"
        />
      )}
    </StateHolderWrapper>
  );
}
