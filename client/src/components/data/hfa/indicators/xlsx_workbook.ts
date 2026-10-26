import { read, utils, write } from "xlsx";
import {
  HFA_INDICATOR_ID_REGEX,
  HFA_VARIANT_ITEM_ID_REGEX,
  type HfaIndicator,
  type HfaIndicatorCategory,
  type HfaIndicatorCode,
  type HfaIndicatorServiceCategory,
  type HfaIndicatorSubCategory,
  type HfaIndicatorVariantCode,
  type HfaIndicatorVariantGroup,
  type HfaIndicatorVariantItem,
  type HfaWorkbookImport,
  isReservedHfaId,
  type Language,
  nextHfaIndicatorId,
  parseMultiMembershipValues,
  pickLang,
  serialiseMultiMembershipValues,
  type TranslatableString,
} from "lib";

const SHEET_CATEGORIES = "Categories";
const SHEET_SUB_CATEGORIES = "Sub-categories";
const SHEET_SERVICE_CATEGORIES = "Service categories";
const SHEET_VARIANT_GROUPS = "Variant groups";
const SHEET_VARIANT_ITEMS = "Variant items";
const SHEET_INDICATORS = "Indicators";

// Export column format: r_code__<timePointLabel>, r_filter_code__<timePointLabel>
// Import also accepts the old positional format: r_code_1, r_filter_code_1
// Variant code columns (labeled format only): r_variant_code__<itemId>__<timePointLabel>.
// itemId legally contains "__", so the header is resolved against the Variant
// items sheet by longest-matching item id: never by blind splitting.

// ============================================================================
// Build (export): all in the browser
// ============================================================================

export function buildHfaWorkbookBlob(args: {
  categories: HfaIndicatorCategory[];
  subCategories: HfaIndicatorSubCategory[];
  serviceCategories: HfaIndicatorServiceCategory[];
  variantGroups: HfaIndicatorVariantGroup[];
  variantItems: HfaIndicatorVariantItem[];
  indicators: HfaIndicator[];
  code: HfaIndicatorCode[];
  variantCode: HfaIndicatorVariantCode[];
  timePoints: string[]; // already sorted
}): Blob {
  const {
    categories,
    subCategories,
    serviceCategories,
    variantGroups,
    variantItems,
    indicators,
    code,
    variantCode,
    timePoints,
  } = args;

  const categoriesAoa: string[][] = [["id", "label"]];
  for (const cat of categories) categoriesAoa.push([cat.id, cat.label]);

  const subCategoriesAoa: string[][] = [["id", "categoryId", "label"]];
  for (const sc of subCategories) {
    subCategoriesAoa.push([sc.id, sc.categoryId, sc.label]);
  }

  const serviceCategoriesAoa: string[][] = [["id", "label"]];
  for (const svc of serviceCategories) {
    serviceCategoriesAoa.push([svc.id, svc.label]);
  }

  const variantGroupsAoa: string[][] = [["id", "label"]];
  for (const vg of variantGroups) variantGroupsAoa.push([vg.id, vg.label]);

  const variantItemsAoa: string[][] = [["id", "groupId", "label"]];
  const sortedVariantItems = [...variantItems].sort(
    (a, b) => a.groupId.localeCompare(b.groupId) || a.sortOrder - b.sortOrder,
  );
  for (const vi of sortedVariantItems) {
    variantItemsAoa.push([vi.id, vi.groupId, vi.label]);
  }

  const codeByKey = new Map<string, { rCode: string; rFilterCode: string }>();
  for (const c of code) {
    codeByKey.set(`${c.indicatorId}__${c.timePoint}`, {
      rCode: c.rCode,
      rFilterCode: c.rFilterCode ?? "",
    });
  }
  const variantCodeByKey = new Map<string, string>();
  for (const c of variantCode) {
    variantCodeByKey.set(
      `${c.indicatorId} / ${c.timePoint} / ${c.itemId}`,
      c.rCode,
    );
  }

  const indicatorHeaders = [
    "indicatorId",
    "categoryId",
    "subCategoryId",
    "serviceCategoryId",
    "shortLabel",
    "label",
    "type",
    "aggregation",
    "variantGroupId",
  ];
  // New label-embedded format so the file is self-describing on re-import
  for (const tp of timePoints) {
    indicatorHeaders.push(`r_code__${tp}`, `r_filter_code__${tp}`);
  }
  for (const vi of sortedVariantItems) {
    for (const tp of timePoints) {
      indicatorHeaders.push(`r_variant_code__${vi.id}__${tp}`);
    }
  }

  const indicatorsAoa: string[][] = [indicatorHeaders];
  for (const ind of indicators) {
    const row: string[] = [
      ind.indicatorId,
      ind.categoryId ?? "",
      ind.subCategoryId ?? "",
      serialiseMultiMembershipValues(ind.serviceCategoryIds),
      ind.shortLabel,
      ind.definition,
      ind.type,
      ind.aggregation,
      ind.variantGroupId ?? "",
    ];
    for (const tp of timePoints) {
      const entry = codeByKey.get(`${ind.indicatorId}__${tp}`);
      row.push(entry?.rCode ?? "", entry?.rFilterCode ?? "");
    }
    for (const vi of sortedVariantItems) {
      for (const tp of timePoints) {
        row.push(
          variantCodeByKey.get(`${ind.indicatorId} / ${tp} / ${vi.id}`) ?? "",
        );
      }
    }
    indicatorsAoa.push(row);
  }

  const wb = utils.book_new();
  utils.book_append_sheet(
    wb,
    utils.aoa_to_sheet(categoriesAoa),
    SHEET_CATEGORIES,
  );
  utils.book_append_sheet(
    wb,
    utils.aoa_to_sheet(subCategoriesAoa),
    SHEET_SUB_CATEGORIES,
  );
  utils.book_append_sheet(
    wb,
    utils.aoa_to_sheet(serviceCategoriesAoa),
    SHEET_SERVICE_CATEGORIES,
  );
  utils.book_append_sheet(
    wb,
    utils.aoa_to_sheet(variantGroupsAoa),
    SHEET_VARIANT_GROUPS,
  );
  utils.book_append_sheet(
    wb,
    utils.aoa_to_sheet(variantItemsAoa),
    SHEET_VARIANT_ITEMS,
  );
  utils.book_append_sheet(
    wb,
    utils.aoa_to_sheet(indicatorsAoa),
    SHEET_INDICATORS,
  );

  const out = write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ============================================================================
// Parse + validate, phase 1: detect shape (no time point mapping yet)
// ============================================================================

export type WorkbookShape = {
  categories: HfaWorkbookImport["categories"];
  subCategories: HfaWorkbookImport["subCategories"];
  serviceCategories: HfaWorkbookImport["serviceCategories"];
  variantGroups: HfaWorkbookImport["variantGroups"];
  variantItems: HfaWorkbookImport["variantItems"];
  indicators: HfaWorkbookImport["indicators"];
  // [indicatorIdx][xlsxPosition] raw code values
  rawCode: Array<Array<{ rCode: string; rFilterCode: string }>>;
  // Variant code columns (labeled format only) and their per-indicator values:
  // [indicatorIdx][variantColumnIdx]
  variantColumns: Array<{ itemId: string; label: string }>;
  rawVariantCode: Array<Array<string>>;
  // How many r_code columns are in the XLSX
  xlsxCount: number;
  // For each position: the embedded time point label (new format), or null (old r_code_N format)
  xlsxLabels: Array<string | null>;
};

export type DetectResult =
  | { ok: true; shape: WorkbookShape }
  | DetectError;

function normalizeSheetName(name: string): string {
  return name.toLowerCase().replace(/[\s_-]/g, "");
}

function sheetToObjects(aoa: string[][]): Record<string, string>[] {
  if (!aoa || aoa.length === 0) return [];
  const headers = (aoa[0] ?? []).map((h) => String(h ?? "").trim());
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const allEmpty = headers.every((_, c) =>
      String(row[c] ?? "").trim() === ""
    );
    if (allEmpty) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      obj[headers[c]] = String(row[c] ?? "").trim();
    }
    rows.push(obj);
  }
  return rows;
}

// A text column is written once (`label`) or once per language (`label_en`,
// `label_fr`, `label_pt`). The import reads the instance language's column,
// then English, then the single column, so one default workbook serves every
// instance and a cell left untranslated shows English rather than failing.
const LANGUAGES: readonly Language[] = ["en", "fr", "pt"];

function pickText(
  row: Record<string, string>,
  field: string,
  language: Language,
): string {
  return row[`${field}_${language}`] || row[`${field}_en`] || row[field] || "";
}

type DetectError = { ok: false; err: string };

// Error texts keep the sheet names and column headers as the workbook spells
// them, since the user has to find them there.
function sheetError(
  language: Language,
  sheet: string,
  problem: TranslatableString,
): DetectError {
  return {
    ok: false,
    err: pickLang(language, {
      en: `${sheet} sheet: ${problem.en}`,
      fr: `Feuille ${sheet} : ${problem.fr}`,
      pt: `Folha ${sheet}: ${problem.pt}`,
    }),
  };
}

// `index` is the 0-based data row; the workbook's row number follows the
// header row.
function rowError(
  language: Language,
  sheet: string,
  index: number,
  problem: TranslatableString,
): DetectError {
  const row = index + 2;
  return {
    ok: false,
    err: pickLang(language, {
      en: `${sheet} sheet, row ${row}: ${problem.en}`,
      fr: `Feuille ${sheet}, ligne ${row} : ${problem.fr}`,
      pt: `Folha ${sheet}, linha ${row}: ${problem.pt}`,
    }),
  };
}

const missingValue = (field: string): TranslatableString => ({
  en: `missing ${field}.`,
  fr: `${field} manquant.`,
  pt: `${field} em falta.`,
});
const duplicateId = (id: string): TranslatableString => ({
  en: `duplicate id "${id}".`,
  fr: `id « ${id} » en double.`,
  pt: `id "${id}" duplicado.`,
});
const notInSheet = (
  field: string,
  value: string,
  sheet: string,
): TranslatableString => ({
  en: `${field} "${value}" is not in the ${sheet} sheet.`,
  fr: `${field} « ${value} » n'est pas dans la feuille ${sheet}.`,
  pt: `${field} "${value}" não está na folha ${sheet}.`,
});
const notFound = (field: string, value: string): TranslatableString => ({
  en: `${field} "${value}" not found.`,
  fr: `${field} « ${value} » introuvable.`,
  pt: `${field} "${value}" não encontrado.`,
});

function missingTextColumn(
  language: Language,
  aoa: string[][] | undefined,
  sheet: string,
  field: string,
): DetectError | null {
  if (!aoa || aoa.length === 0) return null;
  const headers = (aoa[0] ?? []).map((h) => String(h ?? "").trim());
  const accepted = [field, ...LANGUAGES.map((l) => `${field}_${l}`)];
  if (accepted.some((name) => headers.includes(name))) return null;
  const list = accepted.map((n) => `"${n}"`).join(", ");
  return sheetError(language, sheet, {
    en: `missing "${field}" column (one of ${list}).`,
    fr: `colonne « ${field} » manquante (l'une de ${list}).`,
    pt: `coluna "${field}" em falta (uma de ${list}).`,
  });
}

// `existingIndicatorIds` are the instance's stored ids: a row with a blank
// indicatorId is assigned the next free id after those and the sheet's own.
// `language` is the instance language, which selects the per-language text
// columns.
export function detectHfaWorkbookShape(
  arrayBuffer: ArrayBuffer,
  existingIndicatorIds: Iterable<string>,
  language: Language,
): DetectResult {
  let wb;
  try {
    wb = read(arrayBuffer, { type: "array" });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      err: pickLang(language, {
        en: `Could not read the XLSX file: ${reason}`,
        fr: `Impossible de lire le fichier XLSX : ${reason}`,
        pt: `Não foi possível ler o ficheiro XLSX: ${reason}`,
      }),
    };
  }

  let categoriesAoa: string[][] | undefined;
  let subCategoriesAoa: string[][] | undefined;
  let serviceCategoriesAoa: string[][] | undefined;
  let variantGroupsAoa: string[][] | undefined;
  let variantItemsAoa: string[][] | undefined;
  let indicatorsAoa: string[][] | undefined;
  for (const name of wb.SheetNames) {
    const aoa = utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1 });
    const n = normalizeSheetName(name);
    if (n === "subcategories") subCategoriesAoa = aoa;
    else if (n === "servicecategories") serviceCategoriesAoa = aoa;
    else if (n === "variantgroups") variantGroupsAoa = aoa;
    else if (n === "variantitems") variantItemsAoa = aoa;
    else if (n === "categories") categoriesAoa = aoa;
    else if (n === "indicators") indicatorsAoa = aoa;
  }

  if (!indicatorsAoa) {
    return {
      ok: false,
      err: pickLang(language, {
        en: `Workbook is missing an "${SHEET_INDICATORS}" sheet.`,
        fr: `Le classeur n'a pas de feuille « ${SHEET_INDICATORS} ».`,
        pt: `O livro não tem uma folha "${SHEET_INDICATORS}".`,
      }),
    };
  }

  // Categories
  const catMissing = missingTextColumn(
    language,
    categoriesAoa,
    SHEET_CATEGORIES,
    "label",
  );
  if (catMissing) return catMissing;
  const catRows = sheetToObjects(categoriesAoa ?? []);
  const categories: WorkbookShape["categories"] = [];
  const categoryIds = new Set<string>();
  for (let i = 0; i < catRows.length; i++) {
    const id = catRows[i].id ?? "";
    const label = pickText(catRows[i], "label", language);
    if (!id) {
      return rowError(language, SHEET_CATEGORIES, i, missingValue("id"));
    }
    if (!label) {
      return rowError(language, SHEET_CATEGORIES, i, missingValue("label"));
    }
    if (categoryIds.has(id)) {
      return rowError(language, SHEET_CATEGORIES, i, duplicateId(id));
    }
    categoryIds.add(id);
    categories.push({ id, label });
  }

  // Sub-categories
  const subMissing = missingTextColumn(
    language,
    subCategoriesAoa,
    SHEET_SUB_CATEGORIES,
    "label",
  );
  if (subMissing) return subMissing;
  const subRows = sheetToObjects(subCategoriesAoa ?? []);
  const subCategories: WorkbookShape["subCategories"] = [];
  const subCategoryParent = new Map<string, string>();
  for (let i = 0; i < subRows.length; i++) {
    const id = subRows[i].id ?? "";
    const categoryId = subRows[i].categoryId ?? "";
    const label = pickText(subRows[i], "label", language);
    if (!id) {
      return rowError(language, SHEET_SUB_CATEGORIES, i, missingValue("id"));
    }
    if (!categoryId) {
      return rowError(
        language,
        SHEET_SUB_CATEGORIES,
        i,
        missingValue("categoryId"),
      );
    }
    if (!label) {
      return rowError(language, SHEET_SUB_CATEGORIES, i, missingValue("label"));
    }
    if (subCategoryParent.has(id)) {
      return rowError(language, SHEET_SUB_CATEGORIES, i, duplicateId(id));
    }
    if (!categoryIds.has(categoryId)) {
      return rowError(
        language,
        SHEET_SUB_CATEGORIES,
        i,
        notInSheet("categoryId", categoryId, SHEET_CATEGORIES),
      );
    }
    subCategoryParent.set(id, categoryId);
    subCategories.push({ id, categoryId, label });
  }

  // Service categories (optional sheet)
  const svcMissing = missingTextColumn(
    language,
    serviceCategoriesAoa,
    SHEET_SERVICE_CATEGORIES,
    "label",
  );
  if (svcMissing) return svcMissing;
  const svcRows = sheetToObjects(serviceCategoriesAoa ?? []);
  const serviceCategories: WorkbookShape["serviceCategories"] = [];
  const validServiceCategoryIds = new Set<string>();
  for (let i = 0; i < svcRows.length; i++) {
    const id = svcRows[i].id ?? "";
    const label = pickText(svcRows[i], "label", language);
    if (!id) {
      return rowError(
        language,
        SHEET_SERVICE_CATEGORIES,
        i,
        missingValue("id"),
      );
    }
    if (id.includes("|")) {
      return rowError(language, SHEET_SERVICE_CATEGORIES, i, {
        en: `id "${id}" cannot contain "|".`,
        fr: `l'id « ${id} » ne peut pas contenir « | ».`,
        pt: `o id "${id}" não pode conter "|".`,
      });
    }
    if (!label) {
      return rowError(
        language,
        SHEET_SERVICE_CATEGORIES,
        i,
        missingValue("label"),
      );
    }
    if (validServiceCategoryIds.has(id)) {
      return rowError(language, SHEET_SERVICE_CATEGORIES, i, duplicateId(id));
    }
    validServiceCategoryIds.add(id);
    serviceCategories.push({ id, label });
  }

  // Variant groups (optional sheet)
  const vgMissing = missingTextColumn(
    language,
    variantGroupsAoa,
    SHEET_VARIANT_GROUPS,
    "label",
  );
  if (vgMissing) return vgMissing;
  const vgRows = sheetToObjects(variantGroupsAoa ?? []);
  const variantGroups: WorkbookShape["variantGroups"] = [];
  const variantGroupIds = new Set<string>();
  for (let i = 0; i < vgRows.length; i++) {
    const id = vgRows[i].id ?? "";
    const label = pickText(vgRows[i], "label", language);
    if (!id) {
      return rowError(language, SHEET_VARIANT_GROUPS, i, missingValue("id"));
    }
    if (!label) {
      return rowError(language, SHEET_VARIANT_GROUPS, i, missingValue("label"));
    }
    if (variantGroupIds.has(id)) {
      return rowError(language, SHEET_VARIANT_GROUPS, i, duplicateId(id));
    }
    variantGroupIds.add(id);
    variantGroups.push({ id, label });
  }

  // Variant items (optional sheet)
  const viMissing = missingTextColumn(
    language,
    variantItemsAoa,
    SHEET_VARIANT_ITEMS,
    "label",
  );
  if (viMissing) return viMissing;
  const viRows = sheetToObjects(variantItemsAoa ?? []);
  const variantItems: WorkbookShape["variantItems"] = [];
  const variantItemGroup = new Map<string, string>();
  for (let i = 0; i < viRows.length; i++) {
    const id = viRows[i].id ?? "";
    const groupId = viRows[i].groupId ?? "";
    const label = pickText(viRows[i], "label", language);
    if (!id) {
      return rowError(language, SHEET_VARIANT_ITEMS, i, missingValue("id"));
    }
    if (!HFA_VARIANT_ITEM_ID_REGEX.test(id)) {
      return rowError(language, SHEET_VARIANT_ITEMS, i, {
        en:
          `id "${id}" must start with a lowercase letter and contain only lowercase letters, digits, and underscores (max 64 characters).`,
        fr:
          `l'id « ${id} » doit commencer par une lettre minuscule et ne contenir que des lettres minuscules, des chiffres et des tirets bas (64 caractères max).`,
        pt:
          `o id "${id}" deve começar por uma letra minúscula e conter apenas letras minúsculas, dígitos e sublinhados (máx. 64 caracteres).`,
      });
    }
    if (!groupId) {
      return rowError(
        language,
        SHEET_VARIANT_ITEMS,
        i,
        missingValue("groupId"),
      );
    }
    if (!label) {
      return rowError(language, SHEET_VARIANT_ITEMS, i, missingValue("label"));
    }
    if (variantItemGroup.has(id)) {
      return rowError(language, SHEET_VARIANT_ITEMS, i, duplicateId(id));
    }
    if (!variantGroupIds.has(groupId)) {
      return rowError(
        language,
        SHEET_VARIANT_ITEMS,
        i,
        notInSheet("groupId", groupId, SHEET_VARIANT_GROUPS),
      );
    }
    variantItemGroup.set(id, groupId);
    variantItems.push({ id, groupId, label });
  }

  // Indicators sheet: detect r_code columns before parsing rows
  const indHeaders = (indicatorsAoa[0] ?? []).map((h) =>
    String(h ?? "").trim()
  );
  if (!indHeaders.includes("indicatorId")) {
    return sheetError(language, SHEET_INDICATORS, {
      en: `missing "indicatorId" column.`,
      fr: `colonne « indicatorId » manquante.`,
      pt: `coluna "indicatorId" em falta.`,
    });
  }
  const labelMissing = missingTextColumn(
    language,
    indicatorsAoa,
    SHEET_INDICATORS,
    "label",
  );
  if (labelMissing) return labelMissing;

  // Detect code columns in the order they appear.
  // New format: r_code__<label>  →  label embedded
  // Old format: r_code_N  →  positional, label=null
  const codeColumns: Array<
    { headerIndex: number; filterHeaderIndex: number; label: string | null }
  > = [];
  {
    // Build a map from r_code column to its corresponding r_filter_code column
    const filterMap = new Map<string, number>(); // r_code header → index of r_filter_code header
    for (let c = 0; c < indHeaders.length; c++) {
      const h = indHeaders[c];
      const newFilter = h.match(/^r_filter_code__(.+)$/);
      const oldFilter = h.match(/^r_filter_code_(\d+)$/);
      if (newFilter) filterMap.set(`r_code__${newFilter[1]}`, c);
      else if (oldFilter) filterMap.set(`r_code_${oldFilter[1]}`, c);
    }

    for (let c = 0; c < indHeaders.length; c++) {
      const h = indHeaders[c];
      const newCode = h.match(/^r_code__(.+)$/);
      const oldCode = h.match(/^r_code_(\d+)$/);
      if (newCode) {
        codeColumns.push({
          headerIndex: c,
          filterHeaderIndex: filterMap.get(h) ?? -1,
          label: newCode[1],
        });
      } else if (oldCode) {
        codeColumns.push({
          headerIndex: c,
          filterHeaderIndex: filterMap.get(h) ?? -1,
          label: null,
        });
      }
    }
  }

  const xlsxCount = codeColumns.length;
  const xlsxLabels = codeColumns.map((c) => c.label);

  // Variant code columns: r_variant_code__<itemId>__<timePointLabel>, resolved
  // against the Variant items sheet by longest-matching item id (item ids can
  // legally contain "__", so blind splitting is ambiguous).
  const variantColumns: Array<
    { itemId: string; label: string; headerIndex: number }
  > = [];
  const knownItemIds = [...variantItemGroup.keys()].sort((a, b) =>
    b.length - a.length
  );
  for (let c = 0; c < indHeaders.length; c++) {
    const m = indHeaders[c].match(/^r_variant_code__(.+)$/);
    if (!m) continue;
    const rest = m[1];
    const itemId = knownItemIds.find((id) => rest.startsWith(`${id}__`));
    if (itemId === undefined) {
      return sheetError(language, SHEET_INDICATORS, {
        en: `variant code column "${
          indHeaders[c]
        }" does not start with an id from the ${SHEET_VARIANT_ITEMS} sheet.`,
        fr: `la colonne de code de variante « ${
          indHeaders[c]
        } » ne commence pas par un id de la feuille ${SHEET_VARIANT_ITEMS}.`,
        pt: `a coluna de código de variante "${
          indHeaders[c]
        }" não começa por um id da folha ${SHEET_VARIANT_ITEMS}.`,
      });
    }
    const label = rest.slice(itemId.length + 2);
    if (!label) {
      return sheetError(language, SHEET_INDICATORS, {
        en: `variant code column "${
          indHeaders[c]
        }" is missing a time point label after the item id.`,
        fr: `la colonne de code de variante « ${
          indHeaders[c]
        } » n'a pas de libellé de point temporel après l'id de l'élément.`,
        pt: `a coluna de código de variante "${
          indHeaders[c]
        }" não tem etiqueta de ponto temporal após o id do item.`,
      });
    }
    variantColumns.push({ itemId, label, headerIndex: c });
  }
  if (variantColumns.length > 0) {
    const mainLabels = new Set(
      xlsxLabels.filter((l): l is string => l !== null),
    );
    for (const vc of variantColumns) {
      if (!mainLabels.has(vc.label)) {
        return sheetError(language, SHEET_INDICATORS, {
          en:
            `variant code column for item "${vc.itemId}" uses time point label "${vc.label}", which has no matching r_code__${vc.label} column.`,
          fr:
            `la colonne de code de variante de l'élément « ${vc.itemId} » utilise le libellé de point temporel « ${vc.label} », sans colonne r_code__${vc.label} correspondante.`,
          pt:
            `a coluna de código de variante do item "${vc.itemId}" usa a etiqueta de ponto temporal "${vc.label}", sem coluna r_code__${vc.label} correspondente.`,
        });
      }
    }
  }

  // Parse indicator rows
  const indRows = sheetToObjects(indicatorsAoa);
  const indicators: WorkbookShape["indicators"] = [];
  const rawCode: WorkbookShape["rawCode"] = [];
  const rawVariantCode: WorkbookShape["rawVariantCode"] = [];
  const usedIndicatorIds = new Set<string>();
  const takenIds = new Set([
    ...existingIndicatorIds,
    ...indRows.map((r) => (r.indicatorId ?? "").trim()).filter((id) =>
      id !== ""
    ),
  ]);

  for (let i = 0; i < indRows.length; i++) {
    const row = indRows[i];

    const typeLower = (row.type ?? "").toLowerCase();
    let type: "binary" | "numeric";
    if (typeLower === "boolean" || typeLower === "binary") type = "binary";
    else if (typeLower === "numeric") type = "numeric";
    else {
      const got = row.type ?? "";
      return rowError(language, SHEET_INDICATORS, i, {
        en:
          `type must be "binary"/"Boolean" or "numeric"/"Numeric", got "${got}".`,
        fr:
          `type doit être « binary »/« Boolean » ou « numeric »/« Numeric », reçu « ${got} ».`,
        pt:
          `type deve ser "binary"/"Boolean" ou "numeric"/"Numeric", recebido "${got}".`,
      });
    }

    const aggLower = (row.aggregation ?? "").toLowerCase();
    let aggregation: "sum" | "avg";
    if (aggLower === "sum") aggregation = "sum";
    else if (
      aggLower === "avg" || aggLower === "average" || aggLower === "mean"
    ) aggregation = "avg";
    else {
      const got = row.aggregation ?? "";
      return rowError(language, SHEET_INDICATORS, i, {
        en: `aggregation must be "sum" or "avg", got "${got}".`,
        fr: `aggregation doit être « sum » ou « avg », reçu « ${got} ».`,
        pt: `aggregation deve ser "sum" ou "avg", recebido "${got}".`,
      });
    }

    let indicatorId = (row.indicatorId ?? "").trim();
    if (!indicatorId) {
      indicatorId = nextHfaIndicatorId(takenIds);
      takenIds.add(indicatorId);
    }
    if (!HFA_INDICATOR_ID_REGEX.test(indicatorId)) {
      return rowError(language, SHEET_INDICATORS, i, {
        en:
          `indicatorId "${indicatorId}" must start with a letter and contain only letters, digits, and underscores (max 64 characters).`,
        fr:
          `indicatorId « ${indicatorId} » doit commencer par une lettre et ne contenir que des lettres, des chiffres et des tirets bas (64 caractères max).`,
        pt:
          `indicatorId "${indicatorId}" deve começar por uma letra e conter apenas letras, dígitos e sublinhados (máx. 64 caracteres).`,
      });
    }
    if (isReservedHfaId(indicatorId)) {
      return rowError(language, SHEET_INDICATORS, i, {
        en:
          `indicatorId "${indicatorId}" is a reserved word (a function or operator of the indicator code, or a column the analysis script generates). Choose a different id.`,
        fr:
          `indicatorId « ${indicatorId} » est un mot réservé (une fonction ou un opérateur du code d'indicateur, ou une colonne générée par le script d'analyse). Choisissez un autre id.`,
        pt:
          `indicatorId "${indicatorId}" é uma palavra reservada (uma função ou operador do código de indicador, ou uma coluna gerada pelo script de análise). Escolha outro id.`,
      });
    }
    if (usedIndicatorIds.has(indicatorId)) {
      return rowError(language, SHEET_INDICATORS, i, {
        en: `duplicate indicatorId "${indicatorId}".`,
        fr: `indicatorId « ${indicatorId} » en double.`,
        pt: `indicatorId "${indicatorId}" duplicado.`,
      });
    }
    usedIndicatorIds.add(indicatorId);

    const categoryId = (row.categoryId ?? "").trim() || null;
    const subCategoryId = (row.subCategoryId ?? "").trim() || null;
    // Pipe-delimited: one indicator can belong to multiple service categories.
    const serviceCategoryIds = parseMultiMembershipValues(
      row.serviceCategoryId ?? "",
    );

    for (const scId of serviceCategoryIds) {
      if (!validServiceCategoryIds.has(scId)) {
        return rowError(
          language,
          SHEET_INDICATORS,
          i,
          notFound("serviceCategoryId", scId),
        );
      }
    }
    if (categoryId && !categoryIds.has(categoryId)) {
      return rowError(
        language,
        SHEET_INDICATORS,
        i,
        notFound("categoryId", categoryId),
      );
    }
    if (subCategoryId) {
      const parent = subCategoryParent.get(subCategoryId);
      if (parent === undefined) {
        return rowError(
          language,
          SHEET_INDICATORS,
          i,
          notFound("subCategoryId", subCategoryId),
        );
      }
      if (!categoryId) {
        return rowError(language, SHEET_INDICATORS, i, {
          en: "subCategoryId requires a categoryId.",
          fr: "subCategoryId exige un categoryId.",
          pt: "subCategoryId exige um categoryId.",
        });
      }
      if (parent !== categoryId) {
        return rowError(language, SHEET_INDICATORS, i, {
          en:
            `subCategoryId "${subCategoryId}" belongs to category "${parent}".`,
          fr:
            `subCategoryId « ${subCategoryId} » appartient à la catégorie « ${parent} ».`,
          pt:
            `subCategoryId "${subCategoryId}" pertence à categoria "${parent}".`,
        });
      }
    }

    const variantGroupId = (row.variantGroupId ?? "").trim() || null;
    if (variantGroupId && !variantGroupIds.has(variantGroupId)) {
      return rowError(
        language,
        SHEET_INDICATORS,
        i,
        notInSheet("variantGroupId", variantGroupId, SHEET_VARIANT_GROUPS),
      );
    }

    indicators.push({
      indicatorId,
      categoryId,
      subCategoryId,
      serviceCategoryIds,
      shortLabel: pickText(row, "shortLabel", language),
      definition: pickText(row, "label", language),
      type,
      aggregation,
      variantGroupId,
    });

    // Collect raw code values per position using column indices directly
    const rowAoa = (indicatorsAoa[i + 1] ?? []).map((v) =>
      String(v ?? "").trim()
    );
    const positionCode: Array<{ rCode: string; rFilterCode: string }> =
      codeColumns.map((col) => ({
        rCode: col.headerIndex >= 0 ? (rowAoa[col.headerIndex] ?? "") : "",
        rFilterCode: col.filterHeaderIndex >= 0
          ? (rowAoa[col.filterHeaderIndex] ?? "")
          : "",
      }));
    rawCode.push(positionCode);

    const positionVariantCode: string[] = variantColumns.map((col) =>
      rowAoa[col.headerIndex] ?? ""
    );
    for (let k = 0; k < variantColumns.length; k++) {
      if (!positionVariantCode[k]) continue;
      const itemGroup = variantItemGroup.get(variantColumns[k].itemId);
      if (!variantGroupId || itemGroup !== variantGroupId) {
        const itemId = variantColumns[k].itemId;
        const groupOfIndicator = variantGroupId ?? "";
        const groupOfItem = itemGroup ?? "";
        return rowError(language, SHEET_INDICATORS, i, {
          en:
            `variant code for item "${itemId}", but the indicator's variantGroupId is "${groupOfIndicator}" and the item belongs to group "${groupOfItem}".`,
          fr:
            `code de variante pour l'élément « ${itemId} », mais le variantGroupId de l'indicateur est « ${groupOfIndicator} » et l'élément appartient au groupe « ${groupOfItem} ».`,
          pt:
            `código de variante para o item "${itemId}", mas o variantGroupId do indicador é "${groupOfIndicator}" e o item pertence ao grupo "${groupOfItem}".`,
        });
      }
    }
    rawVariantCode.push(positionVariantCode);
  }

  return {
    ok: true,
    shape: {
      categories,
      subCategories,
      serviceCategories,
      variantGroups,
      variantItems,
      indicators,
      rawCode,
      variantColumns: variantColumns.map((c) => ({
        itemId: c.itemId,
        label: c.label,
      })),
      rawVariantCode,
      xlsxCount,
      xlsxLabels,
    },
  };
}

// ============================================================================
// Phase 2: apply time point mapping to produce final code
// ============================================================================

// mapping[xlsxPosition] = the platform time points that column's code goes to;
// empty skips the position. A single code column applied to every time point
// is a position with several targets.
export type TimePointMapping = string[][];

export function applyTimePointMapping(
  shape: WorkbookShape,
  mapping: TimePointMapping,
): HfaIndicatorCode[] {
  const code: HfaIndicatorCode[] = [];
  for (let i = 0; i < shape.indicators.length; i++) {
    const ind = shape.indicators[i];
    const posCode = shape.rawCode[i] ?? [];
    for (let k = 0; k < shape.xlsxCount; k++) {
      const { rCode, rFilterCode } = posCode[k] ??
        { rCode: "", rFilterCode: "" };
      if (!rCode && !rFilterCode) continue;
      for (const tp of mapping[k] ?? []) {
        code.push({
          indicatorId: ind.indicatorId,
          timePoint: tp,
          rCode,
          rFilterCode: rFilterCode || undefined,
        });
      }
    }
  }
  return code;
}

// Variant columns carry embedded labels (detect rejects any without a matching
// labeled r_code__ column), so they resolve through the same mapping via
// label → platform time points. A label mapped to nothing (skipped) skips its
// variant cells too.
export function applyVariantTimePointMapping(
  shape: WorkbookShape,
  mapping: TimePointMapping,
): HfaIndicatorVariantCode[] {
  const labelToTps = new Map<string, string[]>();
  for (let k = 0; k < shape.xlsxCount; k++) {
    const label = shape.xlsxLabels[k];
    if (label !== null) labelToTps.set(label, mapping[k] ?? []);
  }
  const variantCode: HfaIndicatorVariantCode[] = [];
  for (let i = 0; i < shape.indicators.length; i++) {
    const ind = shape.indicators[i];
    const posCode = shape.rawVariantCode[i] ?? [];
    for (let k = 0; k < shape.variantColumns.length; k++) {
      const rCode = posCode[k] ?? "";
      if (!rCode) continue;
      for (const tp of labelToTps.get(shape.variantColumns[k].label) ?? []) {
        variantCode.push({
          indicatorId: ind.indicatorId,
          timePoint: tp,
          itemId: shape.variantColumns[k].itemId,
          rCode,
        });
      }
    }
  }
  return variantCode;
}
