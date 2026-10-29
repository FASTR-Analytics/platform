import {
  type AdminAreaDuplicateGroup,
  type AdminAreaLevel,
  type AdminAreaOption,
  type APIResponseWithData,
  type FacilityFamily,
  t3,
} from "lib";
import {
  Button,
  createFormAction,
  createQuery,
  Select,
  StateHolderFormError,
  StateHolderWrapper,
} from "panther";
import { createMemo, createSignal, For, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { AdminAreaDuplicatesWarning } from "./_shared/mod.ts";

type Props = {
  family: FacilityFamily;
  adminAreaLevel: AdminAreaLevel;
  close: (p: unknown) => void;
};

type FeatureGroup = {
  key: string;
  areaId: string;
  sourceName: string | null;
  count: number;
};

type LevelMapping = {
  featureGroups: FeatureGroup[];
  adminAreaOptions: AdminAreaOption[];
  adminAreaDuplicates: AdminAreaDuplicateGroup[];
};

// One feature group per stored area_id, and one per source name among the
// features that carry no area_id.
function groupFeatures(geojson: string): FeatureGroup[] {
  const parsed = JSON.parse(geojson) as {
    type: "FeatureCollection";
    features: Array<{
      properties: {
        area_id?: string;
        source_name?: string;
        dhis2_name?: string;
      };
    }>;
  };

  const groups = new Map<string, FeatureGroup>();
  for (const feature of parsed.features) {
    const areaId = feature.properties?.area_id ?? "";
    // Support both new (source_name) and old (dhis2_name) formats
    const sourceName = feature.properties?.source_name ??
      feature.properties?.dhis2_name ?? null;
    const groupKey = areaId === ""
      ? `__unmatched__${sourceName ?? ""}`
      : areaId;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { key: groupKey, areaId, sourceName, count: 0 });
    }
    groups.get(groupKey)!.count++;
  }

  // Unmatched first, then by area name
  return [...groups.values()].sort((a, b) => {
    if (a.areaId === "" && b.areaId !== "") return -1;
    if (a.areaId !== "" && b.areaId === "") return 1;
    if (a.areaId === "" && b.areaId === "") {
      return (a.sourceName ?? "").localeCompare(b.sourceName ?? "");
    }
    return a.areaId.localeCompare(b.areaId);
  });
}

async function loadLevelMapping(
  family: FacilityFamily,
  level: AdminAreaLevel,
): Promise<APIResponseWithData<LevelMapping>> {
  const [geoRes, optionsRes] = await Promise.all([
    serverActions.getGeoJsonForLevel({ family, level }),
    serverActions.getAdminAreaOptionsForLevel({ family, level }),
  ]);
  if (!geoRes.success) {
    return geoRes;
  }
  if (!optionsRes.success) {
    return optionsRes;
  }
  return {
    success: true,
    data: {
      featureGroups: groupFeatures(geoRes.data.geojson),
      adminAreaOptions: optionsRes.data.options,
      adminAreaDuplicates: optionsRes.data.duplicates,
    },
  };
}

export function GeoJsonEditModal(p: Props) {
  const mapping = createQuery(
    () => loadLevelMapping(p.family, p.adminAreaLevel),
    t3({ en: "Loading...", fr: "Chargement...", pt: "A carregar..." }),
  );

  return (
    <div
      class="ui-pad-lg ui-spy"
      style={{
        "min-width": "600px",
        "max-height": "80vh",
        "overflow-y": "auto",
      }}
    >
      <div class="ui-text-heading">
        {t3({
          en: "Edit GeoJSON Mapping",
          fr: "Modifier le mappage GeoJSON",
          pt: "Editar a associação GeoJSON",
        })}
        {" — "}
        {p.family === "hmis"
          ? t3({ en: "HMIS", fr: "SNIS", pt: "HMIS" })
          : t3({ en: "HFA", fr: "Enquêtes FOSA", pt: "FOSA" })}{" "}
        AA{p.adminAreaLevel}
      </div>

      <StateHolderWrapper
        state={mapping.state()}
        onErrorButton={{
          label: t3({ en: "Close", fr: "Fermer", pt: "Fechar" }),
          onClick: () => p.close(undefined),
        }}
      >
        {(data) => (
          <GeoJsonEditBody
            family={p.family}
            adminAreaLevel={p.adminAreaLevel}
            featureGroups={data.featureGroups}
            adminAreaOptions={data.adminAreaOptions}
            adminAreaDuplicates={data.adminAreaDuplicates}
            close={p.close}
          />
        )}
      </StateHolderWrapper>
    </div>
  );
}

function GeoJsonEditBody(p: {
  family: FacilityFamily;
  adminAreaLevel: AdminAreaLevel;
  featureGroups: FeatureGroup[];
  adminAreaOptions: AdminAreaOption[];
  adminAreaDuplicates: AdminAreaDuplicateGroup[];
  close: (p: unknown) => void;
}) {
  // Overrides only: a group with no entry keeps its stored area_id, so there
  // is nothing to seed and an untouched group can never read as changed.
  const [overrides, setOverrides] = createSignal<Record<string, string>>({});
  const mappingOf = (group: FeatureGroup) =>
    overrides()[group.key] ?? group.areaId;

  const hasSourceNames = createMemo(() =>
    p.featureGroups.some((g) => g.sourceName !== null)
  );
  const unmatchedCount = createMemo(() =>
    p.featureGroups.filter((g) => g.areaId === "").length
  );
  const matchedCount = createMemo(() =>
    p.featureGroups.filter((g) => g.areaId !== "").length
  );

  // "" is an explicit unmap. An unmatched group is keyed by source name, which
  // is how the server matches a feature that has no area_id yet.
  const remapping = createMemo(() => {
    const result: Record<string, string> = {};
    for (const group of p.featureGroups) {
      const newAreaId = mappingOf(group);
      if (newAreaId === group.areaId) {
        continue;
      }
      const key = group.areaId === "" && group.sourceName
        ? `__source__${group.sourceName}`
        : group.areaId;
      result[key] = newAreaId;
    }
    return result;
  });
  const hasChanges = () => Object.keys(remapping()).length > 0;

  const selectOptions = createMemo(() => [
    {
      value: "",
      label: t3({
        en: "— Not mapped —",
        fr: "— Non mappé —",
        pt: "— Não associado —",
      }),
    },
    ...p.adminAreaOptions,
  ]);

  const saveAction = createFormAction(
    () =>
      serverActions.remapGeoJson({
        family: p.family,
        adminAreaLevel: p.adminAreaLevel,
        remapping: remapping(),
      }),
    () => p.close(undefined),
  );

  function handleDownload() {
    serverActions
      .getGeoJsonForLevel({ family: p.family, level: p.adminAreaLevel })
      .then((res) => {
        if (!res.success) return;
        const blob = new Blob([res.data.geojson], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `geojson_${p.family}_aa${p.adminAreaLevel}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <div class="ui-spy">
      <div class="text-base-content-muted text-sm">
        {matchedCount()} {t3({ en: "mapped", fr: "mappés", pt: "associados" })}
        <Show when={unmatchedCount() > 0}>
          {" "}
          <span class="text-warning">
            · {unmatchedCount()}{" "}
            {t3({ en: "unmatched", fr: "non mappés", pt: "não associados" })}
          </span>
        </Show>
      </div>

      <AdminAreaDuplicatesWarning groups={p.adminAreaDuplicates} />

      <div class="max-h-96 overflow-auto rounded border">
        <div class="bg-base-100 flex border-b px-3 py-2 text-sm font-700">
          <div class="w-1/2">
            {hasSourceNames()
              ? t3({
                en: "Source Name",
                fr: "Nom source",
                pt: "Nome de origem",
              })
              : t3({
                en: "Current Mapping",
                fr: "Mappage actuel",
                pt: "Associação atual",
              })}
          </div>
          <div class="w-1/2">
            {t3({
              en: "Map to Admin Area",
              fr: "Mapper vers zone admin",
              pt: "Associar a zona administrativa",
            })}
          </div>
        </div>
        <For each={p.featureGroups}>
          {(group) => (
            <div
              class="border-base-200 flex items-center border-b px-3 py-1 last:border-b-0"
              classList={{ "bg-warning-subtle": group.areaId === "" }}
            >
              <div class="w-1/2">
                <div class="text-sm">
                  {group.sourceName ?? group.areaId}
                  <Show when={group.areaId === ""}>
                    {" "}
                    <span class="text-warning text-xs">
                      {t3({
                        en: "(unmatched)",
                        fr: "(non mappé)",
                        pt: "(não associado)",
                      })}
                    </span>
                  </Show>
                </div>
                <Show
                  when={group.areaId !== "" && group.sourceName &&
                    group.sourceName !== group.areaId}
                >
                  <div class="ui-text-caption">
                    {t3({
                      en: "Currently mapped to",
                      fr: "Actuellement mappé vers",
                      pt: "Atualmente associado a",
                    })}: {group.areaId}
                  </div>
                </Show>
                <Show when={group.count > 1}>
                  <div class="ui-text-caption">
                    ({group.count}{" "}
                    {t3({ en: "features", fr: "entités", pt: "entidades" })})
                  </div>
                </Show>
              </div>
              <div class="w-1/2">
                <Select
                  options={selectOptions()}
                  value={mappingOf(group)}
                  onChange={(v) =>
                    setOverrides((prev) => ({ ...prev, [group.key]: v }))}
                  fullWidth
                  size="sm"
                />
              </div>
            </div>
          )}
        </For>
      </div>

      <StateHolderFormError state={saveAction.state()} />

      <div class="ui-gap-sm flex">
        <Button
          onClick={saveAction.click}
          state={saveAction.state()}
          disabled={!hasChanges()}
          intent="primary"
        >
          {t3({
            en: "Save changes",
            fr: "Enregistrer",
            pt: "Guardar as alterações",
          })}
        </Button>
        <Button intent="neutral" onClick={handleDownload} iconName="download">
          {t3({
            en: "Download GeoJSON",
            fr: "Télécharger GeoJSON",
            pt: "Transferir o GeoJSON",
          })}
        </Button>
        <Button intent="neutral" onClick={() => p.close(undefined)}>
          {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
        </Button>
      </div>
    </div>
  );
}
