import {
  type AdminAreaColumn,
  type AdminAreaLevel,
  decodeRawCsvHeader,
  findEncodedCsvHeader,
  findEncodedCsvHeaderIgnoringCase,
  getEnabledOptionalFacilityColumns,
  HFA_CORE_ADMIN_AREA_COLUMNS,
  HFA_CORE_OPTIONAL_FACILITY_COLUMNS,
  hfaCorrectionColumnName,
  type HfaFacilityColumnHeaders,
  type HfaFacilityColumnPreview,
  type HfaFacilityColumns,
  type HfaFacilityColumnsPreview,
  type OptionalFacilityColumn,
  type StructureSchema,
  t3,
} from "lib";
import { hfaFacilityColumnLabel } from "../../_shared/mod.ts";
import {
  Input,
  plural,
  SelectSearch,
  type StateHolder,
  StateHolderWrapper,
  toNum0,
} from "panther";
import { For, Show } from "solid-js";
import { unwrap } from "solid-js/store";

// Where a pre-filled picker's value came from, shown under the picker until
// the user edits it.
export type HfaPrefillSource = "latest" | "name" | "registry" | "country";

// Keyed by picker: "facility_id", a registry column, or a registry column
// plus ":correction".
export type HfaPrefills = Partial<Record<string, HfaPrefillSource>>;

type MappedColumn =
  | Exclude<AdminAreaColumn, "admin_area_1">
  | OptionalFacilityColumn;

export function pickerKey(column: string, correction: boolean): string {
  return correction ? `${column}:correction` : column;
}

// A header of an earlier file, found in this one by its raw text.
function reencodeHeader(rawHeaders: string[], encoded: string): string {
  return findEncodedCsvHeader(rawHeaders, decodeRawCsvHeader(encoded));
}

// One column's pickers: the earlier run's header where this file has it, else
// the questionnaire's name ignoring case; the correction the same way, its
// questionnaire name derived from the header chosen.
function prefillColumn(args: {
  rawHeaders: string[];
  column: MappedColumn;
  latest: HfaFacilityColumnHeaders | undefined;
  coreName: string | undefined;
  prefills: HfaPrefills;
}): HfaFacilityColumnHeaders | undefined {
  const { rawHeaders, column, latest, coreName, prefills } = args;
  const fromLatest = latest ? reencodeHeader(rawHeaders, latest.header) : "";
  const fromName = coreName
    ? findEncodedCsvHeaderIgnoringCase(rawHeaders, coreName)
    : "";
  const header = fromLatest || fromName;
  if (!header) {
    return undefined;
  }
  prefills[pickerKey(column, false)] = fromLatest ? "latest" : "name";
  const correctionFromLatest = latest?.correctionHeader
    ? reencodeHeader(rawHeaders, latest.correctionHeader)
    : "";
  const correctionFromName = findEncodedCsvHeaderIgnoringCase(
    rawHeaders,
    hfaCorrectionColumnName(decodeRawCsvHeader(header)),
  );
  const correctionHeader = correctionFromLatest ||
    (correctionFromName !== header ? correctionFromName : "");
  if (!correctionHeader) {
    return { header };
  }
  prefills[pickerKey(column, true)] = correctionFromLatest ? "latest" : "name";
  return { header, correctionHeader };
}

export function prefillHfaFacilityColumns(args: {
  rawHeaders: string[];
  latest: HfaFacilityColumns | undefined;
  schema: StructureSchema;
  adminArea1: { value: string; source: HfaPrefillSource };
}): { facilityColumns: HfaFacilityColumns; prefills: HfaPrefills } {
  const prefills: HfaPrefills = {
    admin_area_1: args.adminArea1.source,
  };
  const adminAreas: HfaFacilityColumns["adminAreas"] = [];
  for (let level = 2; level <= args.schema.adminDepth; level++) {
    const l = level as AdminAreaLevel;
    const headers = prefillColumn({
      rawHeaders: args.rawHeaders,
      column: `admin_area_${l}`,
      latest: args.latest?.adminAreas.find((a) => a.level === l),
      coreName: HFA_CORE_ADMIN_AREA_COLUMNS[l],
      prefills,
    });
    if (headers) {
      adminAreas.push({ ...headers, level: l });
    }
  }
  const optional: HfaFacilityColumns["optional"] = {};
  for (const column of getEnabledOptionalFacilityColumns(args.schema)) {
    const headers = prefillColumn({
      rawHeaders: args.rawHeaders,
      column,
      latest: args.latest?.optional[column],
      coreName: HFA_CORE_OPTIONAL_FACILITY_COLUMNS[column],
      prefills,
    });
    if (headers) {
      optional[column] = headers;
    }
  }
  return {
    facilityColumns: {
      adminArea1: { value: args.adminArea1.value },
      adminAreas,
      optional,
    },
    prefills,
  };
}

// Why Next is refused, or undefined: the launch validation's rules on the
// facility columns, which the user can fix on this step.
export function hfaFacilityColumnsProblem(
  facilityColumns: HfaFacilityColumns,
  adminDepth: number,
  registryIsEmpty: boolean,
): string | undefined {
  if (facilityColumns.adminArea1.value.trim() === "") {
    return t3({
      en: "Give the country, the value of the first admin area level.",
      fr:
        "Indiquez le pays, la valeur du premier niveau d'unité administrative.",
      pt: "Indique o país, o valor do primeiro nível de zona administrativa.",
    });
  }
  const nAdminLevels = adminDepth - 1;
  const nMapped = facilityColumns.adminAreas.length;
  if (nMapped > 0 && nMapped < nAdminLevels) {
    return t3({
      en: "Map every admin area level, or none.",
      fr: "Associez chaque niveau d'unité administrative, ou aucun.",
      pt: "Associe todos os níveis de zona administrativa, ou nenhum.",
    });
  }
  if (registryIsEmpty && nMapped < nAdminLevels) {
    return t3({
      en:
        "The HFA facility list is empty, so every facility in this file is new: map every admin area level.",
      fr:
        "La liste des établissements HFA est vide, donc chaque établissement de ce fichier est nouveau : associez chaque niveau d'unité administrative.",
      pt:
        "A lista de estabelecimentos HFA está vazia, por isso todos os estabelecimentos deste ficheiro são novos: associe todos os níveis de zona administrativa.",
    });
  }
  const headers = [
    ...facilityColumns.adminAreas,
    ...Object.values(facilityColumns.optional),
  ];
  if (headers.some((h) => h.correctionHeader === h.header)) {
    return t3({
      en: "A correction column must differ from its column.",
      fr: "Une colonne de correction doit différer de sa colonne.",
      pt: "Uma coluna de correção tem de ser diferente da sua coluna.",
    });
  }
  return undefined;
}

type Props = {
  encodedHeaders: string[];
  schema: StructureSchema;
  facilityColumns: HfaFacilityColumns;
  prefills: HfaPrefills;
  registryIsEmpty: boolean;
  preview: StateHolder<HfaFacilityColumnsPreview>;
  onChange: (facilityColumns: HfaFacilityColumns, editedPicker: string) => void;
};

// The registry columns read from the file, each under its pickers with what
// the kept rows hold in it.
export function FacilityColumnsStep(p: Props) {
  const headerOptions = () => [
    {
      value: "",
      label: t3({ en: "Not mapped", fr: "Non associée", pt: "Não associada" }),
    },
    ...p.encodedHeaders.map((h) => ({ value: h, label: h })),
  ];

  const mappedColumns = (): MappedColumn[] => [
    ...Array.from(
      { length: p.schema.adminDepth - 1 },
      (_, i): MappedColumn => `admin_area_${(i + 2) as AdminAreaLevel}`,
    ),
    ...getEnabledOptionalFacilityColumns(p.schema),
  ];

  function headersOf(
    column: MappedColumn,
  ): HfaFacilityColumnHeaders | undefined {
    if (column.startsWith("admin_area_")) {
      const level = Number(column.slice("admin_area_".length));
      return p.facilityColumns.adminAreas.find((a) => a.level === level);
    }
    return p.facilityColumns.optional[column as OptionalFacilityColumn];
  }

  function setHeaders(
    column: MappedColumn,
    headers: HfaFacilityColumnHeaders | undefined,
    correction: boolean,
  ) {
    const next = structuredClone(unwrap(p.facilityColumns));
    if (column.startsWith("admin_area_")) {
      const level = Number(
        column.slice("admin_area_".length),
      ) as AdminAreaLevel;
      const others = next.adminAreas.filter((a) => a.level !== level);
      next.adminAreas = headers
        ? [...others, { ...headers, level }].toSorted((a, b) =>
          a.level - b.level
        )
        : others;
    } else if (headers) {
      next.optional[column as OptionalFacilityColumn] = headers;
    } else {
      delete next.optional[column as OptionalFacilityColumn];
    }
    p.onChange(next, pickerKey(column, correction));
  }

  // The pickers stay mounted while the preview is read again after an edit;
  // only the counts under them wait for it.
  function columnPreview(
    column: MappedColumn,
  ): HfaFacilityColumnPreview | undefined {
    return p.preview.status === "ready"
      ? p.preview.data.columns.find((c) => c.column === column)
      : undefined;
  }

  return (
    <div class="ui-spy">
      <div class="text-base-content-muted text-sm">
        {t3({
          en:
            "Choose the file's columns for each facility's admin areas and attributes. They are read from the same row as the facility's data. A correction column, where a cell is filled, replaces the column's value.",
          fr:
            "Choisissez les colonnes du fichier pour les unités administratives et les attributs de chaque établissement. Elles sont lues dans la même ligne que les données de l'établissement. Une colonne de correction, là où une cellule est remplie, remplace la valeur de la colonne.",
          pt:
            "Escolha as colunas do ficheiro para as zonas administrativas e os atributos de cada estabelecimento. São lidas na mesma linha que os dados do estabelecimento. Uma coluna de correção, onde uma célula está preenchida, substitui o valor da coluna.",
        })}
      </div>
      <div class="ui-spy-sm">
        <div class="w-96">
          <Input
            label={hfaFacilityColumnLabel("admin_area_1")}
            value={p.facilityColumns.adminArea1.value}
            onChange={(value) =>
              p.onChange(
                {
                  ...structuredClone(unwrap(p.facilityColumns)),
                  adminArea1: { value },
                },
                "admin_area_1",
              )}
            fullWidth
          />
        </div>
        <PrefillNote source={p.prefills.admin_area_1} />
      </div>
      <StateHolderWrapper state={p.preview}>
        {(preview) => (
          <div class="text-sm">
            {t3({
              en: `${toNum0(preview.nFacilities)} ${
                plural(preview.nFacilities, {
                  one: "facility",
                  other: "facilities",
                })
              } in the file after filtering and duplicates.`,
              fr: `${toNum0(preview.nFacilities)} ${
                plural(preview.nFacilities, {
                  one: "établissement",
                  other: "établissements",
                })
              } dans le fichier après filtrage et doublons.`,
              pt: `${toNum0(preview.nFacilities)} ${
                plural(preview.nFacilities, {
                  one: "estabelecimento",
                  other: "estabelecimentos",
                })
              } no ficheiro após filtragem e duplicados.`,
            })}
          </div>
        )}
      </StateHolderWrapper>
      <For each={mappedColumns()}>
        {(column) => (
          <div class="ui-pad ui-spy-sm rounded border">
            <div class="ui-gap flex items-start">
              <div class="w-80">
                <SelectSearch
                  label={hfaFacilityColumnLabel(column)}
                  options={headerOptions()}
                  value={headersOf(column)?.header ?? ""}
                  onChange={(header) =>
                    setHeaders(
                      column,
                      header === "" ? undefined : {
                        header,
                        correctionHeader: headersOf(column)
                          ?.correctionHeader,
                      },
                      false,
                    )}
                  fullWidth
                />
                <PrefillNote
                  source={headersOf(column)
                    ? p.prefills[pickerKey(column, false)]
                    : undefined}
                />
              </div>
              <Show when={headersOf(column)}>
                {(headers) => (
                  <div class="w-80">
                    <SelectSearch
                      label={t3({
                        en: "Correction column",
                        fr: "Colonne de correction",
                        pt: "Coluna de correção",
                      })}
                      options={headerOptions()}
                      value={headers().correctionHeader ?? ""}
                      onChange={(correctionHeader) =>
                        setHeaders(
                          column,
                          correctionHeader === ""
                            ? { header: headers().header }
                            : {
                              header: headers().header,
                              correctionHeader,
                            },
                          true,
                        )}
                      fullWidth
                    />
                    <PrefillNote
                      source={headers().correctionHeader
                        ? p.prefills[pickerKey(column, true)]
                        : undefined}
                    />
                  </div>
                )}
              </Show>
            </div>
            <Show when={headersOf(column) && columnPreview(column)}>
              {(preview) => (
                <ColumnPreview
                  preview={preview()}
                  showNotInRegistry={!p.registryIsEmpty}
                />
              )}
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}

function PrefillNote(p: { source: HfaPrefillSource | undefined }) {
  const text = () => {
    switch (p.source) {
      case "latest":
        return t3({
          en: "From the latest import",
          fr: "De la dernière importation",
          pt: "Da última importação",
        });
      case "name":
        return t3({
          en: "Matched by column name",
          fr: "Trouvée par le nom de la colonne",
          pt: "Encontrada pelo nome da coluna",
        });
      case "registry":
        return t3({
          en: "From the HFA facility list",
          fr: "De la liste des établissements HFA",
          pt: "Da lista de estabelecimentos HFA",
        });
      case "country":
        return t3({
          en: "The instance's country",
          fr: "Le pays de l'instance",
          pt: "O país da instância",
        });
      default:
        return undefined;
    }
  };
  return (
    <Show when={text()}>
      {(t) => <div class="text-base-content-muted text-sm">{t()}</div>}
    </Show>
  );
}

function ColumnPreview(p: {
  preview: HfaFacilityColumnPreview;
  showNotInRegistry: boolean;
}) {
  return (
    <div class="ui-spy-sm text-sm">
      <div>
        {t3({
          en: `${toNum0(p.preview.nDistinct)} distinct ${
            plural(p.preview.nDistinct, { one: "value", other: "values" })
          }, ${toNum0(p.preview.nBlank)} blank`,
          fr: `${toNum0(p.preview.nDistinct)} ${
            plural(p.preview.nDistinct, {
              one: "valeur distincte",
              other: "valeurs distinctes",
            })
          }, ${toNum0(p.preview.nBlank)} ${
            plural(p.preview.nBlank, { one: "vide", other: "vides" })
          }`,
          pt: `${toNum0(p.preview.nDistinct)} ${
            plural(p.preview.nDistinct, {
              one: "valor distinto",
              other: "valores distintos",
            })
          }, ${toNum0(p.preview.nBlank)} em branco`,
        })}
        <Show when={p.preview.topValues.length > 0}>
          {": "}
          {p.preview.topValues
            .map((v) => `${v.value} (${toNum0(v.count)})`)
            .join(", ")}
          {p.preview.nDistinct > p.preview.topValues.length ? ", …" : ""}
        </Show>
      </div>
      <Show when={p.preview.nUnresolved > 0}>
        <div class="text-danger">
          {t3({
            en: `${toNum0(p.preview.nUnresolved)} ${
              plural(p.preview.nUnresolved, {
                one: "cell holds",
                other: "cells hold",
              })
            } a code the XLSForm does not label, kept as is: ${
              p.preview.unresolvedSample.join(", ")
            }`,
            fr: `${toNum0(p.preview.nUnresolved)} ${
              plural(p.preview.nUnresolved, {
                one: "cellule contient",
                other: "cellules contiennent",
              })
            } un code sans libellé dans le XLSForm, conservé tel quel : ${
              p.preview.unresolvedSample.join(", ")
            }`,
            pt: `${toNum0(p.preview.nUnresolved)} ${
              plural(p.preview.nUnresolved, {
                one: "célula contém",
                other: "células contêm",
              })
            } um código sem rótulo no XLSForm, mantido como está: ${
              p.preview.unresolvedSample.join(", ")
            }`,
          })}
        </div>
      </Show>
      <Show
        when={p.showNotInRegistry &&
          (p.preview.valuesNotInRegistry ?? []).length > 0}
      >
        <div>
          {t3({
            en: `Not in the HFA facility list: ${
              (p.preview.valuesNotInRegistry ?? []).join(", ")
            }`,
            fr: `Absentes de la liste des établissements HFA : ${
              (p.preview.valuesNotInRegistry ?? []).join(", ")
            }`,
            pt: `Ausentes da lista de estabelecimentos HFA: ${
              (p.preview.valuesNotInRegistry ?? []).join(", ")
            }`,
          })}
        </div>
      </Show>
    </div>
  );
}
