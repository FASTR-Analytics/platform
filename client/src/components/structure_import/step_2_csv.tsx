import { For, Match, Show, Switch, createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import {
  t3,
  type CsvDetails,
  type StructureColumnMappings,
  type InstanceConfigFacilityColumns,
  type FacilityFamily,
  encodeRawCsvHeader,
  getEnabledOptionalFacilityColumns,
} from "lib";
import {
  Button,
  Checkbox,
  Select,
  StateHolderFormError,
  getSelectOptions,
  createFormAction,
} from "panther";
import { serverActions } from "~/server_actions";
import { getStructureColumnLabel } from "./_column_labels";

type Props = {
  step1Result: CsvDetails;
  step2Result: StructureColumnMappings | undefined;
  family: FacilityFamily;
  maxAdminArea: number;
  facilityColumns: InstanceConfigFacilityColumns;
  silentFetch: () => Promise<void>;
};

export function Step2_Csv(p: Props) {
  const optionalCols = getEnabledOptionalFacilityColumns(p.facilityColumns);

  const adminLevels = () => {
    const levels: number[] = [];
    for (let i = 1; i <= p.maxAdminArea; i++) {
      levels.push(i);
    }
    return levels;
  };

  const allColumns = () => [
    "facility_id",
    ...adminLevels().map((i) => `admin_area_${i}`),
    ...optionalCols,
  ];

  // Which columns are toggled on. facility_id is always on. Admin areas are one
  // all-or-nothing group. Optional columns default on (or to whatever a returning
  // attempt previously mapped).
  const [enabled, setEnabled] = createStore<Record<string, boolean>>({
    admin: p.step2Result ? !!p.step2Result.admin_area_1 : true,
    ...Object.fromEntries(
      optionalCols.map((c) => [
        c,
        p.step2Result
          ? !!p.step2Result[c as keyof StructureColumnMappings]
          : true,
      ]),
    ),
  });

  const [tempMappings, setTempMappings] = createStore<Record<string, string>>(
    allColumns().reduce<Record<string, string>>((obj, col) => {
      obj[col] = p.step2Result?.[col as keyof StructureColumnMappings] ?? "";
      return obj;
    }, {}),
  );

  const [needsSaving, setNeedsSaving] = createSignal<boolean>(!p.step2Result);

  const csvHeaders = () =>
    p.step1Result.headers.map((v, i) => encodeRawCsvHeader(i, v));

  function updateMapping(columnKey: string, csvCol: string) {
    setNeedsSaving(true);
    setTempMappings(columnKey, csvCol);
  }

  function toggle(key: string, on: boolean) {
    setNeedsSaving(true);
    setEnabled(key, on);
  }

  const save = createFormAction(async () => {
    const mappings = unwrap(tempMappings);

    if (!mappings["facility_id"]) {
      return {
        success: false,
        err: t3({
          en: "Facility ID mapping is required",
          fr: "Le mappage de l'identifiant d'établissement est requis",
          pt: "A associação do identificador do estabelecimento é obrigatória",
        }),
      };
    }

    // If admin areas are on, every level must be mapped.
    if (enabled.admin) {
      for (const level of adminLevels()) {
        if (!mappings[`admin_area_${level}`]) {
          return {
            success: false,
            err: t3({
              en: "Choose a column for every administrative area level, or turn off Administrative areas.",
              fr: "Choisissez une colonne pour chaque niveau d'unité administrative, ou désactivez les unités administratives.",
              pt: "Escolha uma coluna para cada nível de zona administrativa, ou desative as zonas administrativas.",
            }),
          };
        }
      }
    }

    // Each enabled optional column must be mapped.
    for (const col of optionalCols) {
      if (enabled[col] && !mappings[col]) {
        const label = getStructureColumnLabel(col, p.facilityColumns);
        return {
          success: false,
          err: t3({
            en: `Choose a column for "${label}", or turn it off.`,
            fr: `Choisissez une colonne pour « ${label} », ou désactivez-la.`,
            pt: `Escolha uma coluna para «${label}», ou desative-a.`,
          }),
        };
      }
    }

    // Disabled columns are sent empty (= unmapped). admin_area_1 is always a key
    // in the type, so it is set explicitly ("" when admin is off).
    const columnMappings: StructureColumnMappings = {
      facility_id: mappings["facility_id"],
      admin_area_1: enabled.admin ? (mappings["admin_area_1"] ?? "") : "",
    };
    for (let i = 2; i <= 4; i++) {
      const key = `admin_area_${i}` as keyof StructureColumnMappings;
      (columnMappings as Record<string, string>)[key] =
        enabled.admin && i <= p.maxAdminArea ? (mappings[key] ?? "") : "";
    }
    for (const col of optionalCols) {
      (columnMappings as Record<string, string>)[col] = enabled[col]
        ? (mappings[col] ?? "")
        : "";
    }

    return serverActions.structureStep2Csv_SetColumnMappings({
      family: p.family,
      columnMappings,
    });
  }, p.silentFetch);

  return (
    <div class="ui-pad ui-spy">
      <div class="text-base-content text-sm">
        {t3({
          en: "Turn on the columns you want to import and map each one to a column in your file. Only Facility ID is required; administrative areas are all-or-nothing.",
          fr: "Activez les colonnes que vous voulez importer et associez chacune à une colonne de votre fichier. Seul l'identifiant d'établissement est requis ; les unités administratives sont tout ou rien.",
          pt: "Ative as colunas que pretende importar e associe cada uma a uma coluna do seu ficheiro. Apenas o identificador do estabelecimento é obrigatório; as zonas administrativas são tudo ou nada.",
        })}
      </div>

      <div class="ui-spy-sm">
        {/* facility_id — always required */}
        <div class="flex h-12 items-center">
          <div class="w-72 flex-none">
            <Checkbox
              checked={true}
              disabled
              onChange={() => {}}
              label={`${getStructureColumnLabel("facility_id", p.facilityColumns)} *`}
            />
          </div>
          <div class="w-96">
            <Select
              options={getSelectOptions(csvHeaders())}
              value={tempMappings["facility_id"]}
              onChange={(val) => updateMapping("facility_id", val)}
              placeholder={t3({
                en: "Choose a column…",
                fr: "Choisir une colonne…",
                pt: "Escolher uma coluna…",
              })}
              fullWidth
            />
          </div>
        </div>

        {/* Administrative areas — one all-or-nothing toggle */}
        <div class="ui-spy-sm">
          <Checkbox
            checked={enabled.admin}
            onChange={(v) => toggle("admin", v)}
            label={t3({
              en: "Administrative areas",
              fr: "Unités administratives",
              pt: "Zonas administrativas",
            })}
          />
          <Show when={enabled.admin}>
            <div class="ui-spy-sm">
              <For each={adminLevels()}>
                {(level) => (
                  <div class="flex items-center">
                    <div class="w-72 flex-none pl-12 text-sm">
                      {getStructureColumnLabel(
                        `admin_area_${level}`,
                        p.facilityColumns,
                      )}
                    </div>
                    <div class="w-96">
                      <Select
                        options={getSelectOptions(csvHeaders())}
                        value={tempMappings[`admin_area_${level}`]}
                        onChange={(val) =>
                          updateMapping(`admin_area_${level}`, val)
                        }
                        placeholder={t3({
                          en: "Choose a column…",
                          fr: "Choisir une colonne…",
                          pt: "Escolher uma coluna…",
                        })}
                        fullWidth
                      />
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Optional metadata columns — each independently toggleable */}
        <For each={optionalCols}>
          {(col) => (
            <div class="flex h-12 items-center">
              <div class="w-72 flex-none">
                <Checkbox
                  checked={enabled[col]}
                  onChange={(v) => toggle(col, v)}
                  label={getStructureColumnLabel(col, p.facilityColumns)}
                />
              </div>
              <div class="w-96">
                <Show when={enabled[col]}>
                  <Select
                    options={getSelectOptions(csvHeaders())}
                    value={tempMappings[col]}
                    onChange={(val) => updateMapping(col, val)}
                    placeholder={t3({
                      en: "Choose a column…",
                      fr: "Choisir une colonne…",
                      pt: "Escolher uma coluna…",
                    })}
                    fullWidth
                  />
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>

      <StateHolderFormError state={save.state()} />
      <div class="ui-gap-sm flex">
        <Switch>
          <Match when={needsSaving()}>
            <Button
              onClick={save.click}
              intent="success"
              state={save.state()}
              iconName="save"
            >
              {t3({
                en: "Save and continue",
                fr: "Sauvegarder et continuer",
                pt: "Guardar e continuar",
              })}
            </Button>
          </Match>
          <Match when={true}>
            <div class="text-success">
              {t3({
                en: "Column mappings saved successfully",
                fr: "Mappages de colonnes sauvegardés avec succès",
                pt: "Associações de colunas guardadas com sucesso",
              })}
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}
