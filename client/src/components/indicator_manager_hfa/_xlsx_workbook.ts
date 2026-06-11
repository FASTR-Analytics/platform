import { read, utils, write } from "xlsx";
import type {
  HfaIndicator,
  HfaIndicatorCategory,
  HfaIndicatorCode,
  HfaIndicatorServiceCategory,
  HfaIndicatorSubCategory,
  HfaWorkbookImport,
} from "lib";

const SHEET_CATEGORIES = "Categories";
const SHEET_SUB_CATEGORIES = "Sub-categories";
const SHEET_SERVICE_CATEGORIES = "Service categories";
const SHEET_INDICATORS = "Indicators";

// Export column format: r_code__<timePointLabel>, r_filter_code__<timePointLabel>
// Import also accepts the old positional format: r_code_1, r_filter_code_1

// ============================================================================
// Build (export) — all in the browser
// ============================================================================

export function buildHfaWorkbookBlob(args: {
  categories: HfaIndicatorCategory[];
  subCategories: HfaIndicatorSubCategory[];
  serviceCategories: HfaIndicatorServiceCategory[];
  indicators: HfaIndicator[];
  code: HfaIndicatorCode[];
  timePoints: string[]; // already sorted
}): Blob {
  const { categories, subCategories, serviceCategories, indicators, code, timePoints } = args;

  const categoriesAoa: string[][] = [["id", "label"]];
  for (const cat of categories) categoriesAoa.push([cat.id, cat.label]);

  const subCategoriesAoa: string[][] = [["id", "categoryId", "label"]];
  for (const sc of subCategories) subCategoriesAoa.push([sc.id, sc.categoryId, sc.label]);

  const serviceCategoriesAoa: string[][] = [["id", "label"]];
  for (const svc of serviceCategories) serviceCategoriesAoa.push([svc.id, svc.label]);

  const codeByKey = new Map<string, { rCode: string; rFilterCode: string }>();
  for (const c of code) {
    codeByKey.set(`${c.varName}__${c.timePoint}`, {
      rCode: c.rCode,
      rFilterCode: c.rFilterCode ?? "",
    });
  }

  const indicatorHeaders = [
    "varName", "categoryId", "subCategoryId", "serviceCategoryId",
    "shortLabel", "definition", "type", "aggregation",
  ];
  // New label-embedded format so the file is self-describing on re-import
  for (const tp of timePoints) {
    indicatorHeaders.push(`r_code__${tp}`, `r_filter_code__${tp}`);
  }

  const indicatorsAoa: string[][] = [indicatorHeaders];
  for (const ind of indicators) {
    const row: string[] = [
      ind.varName, ind.categoryId ?? "", ind.subCategoryId ?? "",
      ind.serviceCategoryId ?? "", ind.shortLabel, ind.definition,
      ind.type, ind.aggregation,
    ];
    for (const tp of timePoints) {
      const entry = codeByKey.get(`${ind.varName}__${tp}`);
      row.push(entry?.rCode ?? "", entry?.rFilterCode ?? "");
    }
    indicatorsAoa.push(row);
  }

  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.aoa_to_sheet(categoriesAoa), SHEET_CATEGORIES);
  utils.book_append_sheet(wb, utils.aoa_to_sheet(subCategoriesAoa), SHEET_SUB_CATEGORIES);
  utils.book_append_sheet(wb, utils.aoa_to_sheet(serviceCategoriesAoa), SHEET_SERVICE_CATEGORIES);
  utils.book_append_sheet(wb, utils.aoa_to_sheet(indicatorsAoa), SHEET_INDICATORS);

  const out = write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ============================================================================
// Parse + validate — phase 1: detect shape (no time point mapping yet)
// ============================================================================

export type WorkbookShape = {
  categories: HfaWorkbookImport["categories"];
  subCategories: HfaWorkbookImport["subCategories"];
  serviceCategories: HfaWorkbookImport["serviceCategories"];
  indicators: HfaWorkbookImport["indicators"];
  // [indicatorIdx][xlsxPosition] raw code values
  rawCode: Array<Array<{ rCode: string; rFilterCode: string }>>;
  // How many r_code columns are in the XLSX
  xlsxCount: number;
  // For each position: the embedded time point label (new format), or null (old r_code_N format)
  xlsxLabels: Array<string | null>;
};

export type DetectResult =
  | { ok: true; shape: WorkbookShape }
  | { ok: false; err: string };

function normalizeSheetName(name: string): string {
  return name.toLowerCase().replace(/[\s_-]/g, "");
}

function sheetToObjects(aoa: string[][]): Record<string, string>[] {
  if (!aoa || aoa.length === 0) return [];
  const headers = (aoa[0] ?? []).map((h) => String(h ?? "").trim());
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const allEmpty = headers.every((_, c) => String(row[c] ?? "").trim() === "");
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

export function detectHfaWorkbookShape(arrayBuffer: ArrayBuffer): DetectResult {
  let wb;
  try {
    wb = read(arrayBuffer, { type: "array" });
  } catch (e) {
    return { ok: false, err: `Could not read XLSX file: ${e instanceof Error ? e.message : String(e)}` };
  }

  let categoriesAoa: string[][] | undefined;
  let subCategoriesAoa: string[][] | undefined;
  let serviceCategoriesAoa: string[][] | undefined;
  let indicatorsAoa: string[][] | undefined;
  for (const name of wb.SheetNames) {
    const aoa = utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1 });
    const n = normalizeSheetName(name);
    if (n === "subcategories") subCategoriesAoa = aoa;
    else if (n === "servicecategories") serviceCategoriesAoa = aoa;
    else if (n === "categories") categoriesAoa = aoa;
    else if (n === "indicators") indicatorsAoa = aoa;
  }

  if (!indicatorsAoa) {
    return { ok: false, err: 'Workbook is missing an "Indicators" sheet.' };
  }

  // Categories
  const catRows = sheetToObjects(categoriesAoa ?? []);
  const categories: WorkbookShape["categories"] = [];
  const categoryIds = new Set<string>();
  for (let i = 0; i < catRows.length; i++) {
    const id = catRows[i].id ?? "";
    const label = catRows[i].label ?? "";
    if (!id) return { ok: false, err: `Categories sheet, row ${i + 2}: missing id.` };
    if (!label) return { ok: false, err: `Categories sheet, row ${i + 2}: missing label.` };
    if (categoryIds.has(id)) return { ok: false, err: `Categories sheet, row ${i + 2}: duplicate id "${id}".` };
    categoryIds.add(id);
    categories.push({ id, label });
  }

  // Sub-categories
  const subRows = sheetToObjects(subCategoriesAoa ?? []);
  const subCategories: WorkbookShape["subCategories"] = [];
  const subCategoryParent = new Map<string, string>();
  for (let i = 0; i < subRows.length; i++) {
    const id = subRows[i].id ?? "";
    const categoryId = subRows[i].categoryId ?? "";
    const label = subRows[i].label ?? "";
    if (!id) return { ok: false, err: `Sub-categories sheet, row ${i + 2}: missing id.` };
    if (!categoryId) return { ok: false, err: `Sub-categories sheet, row ${i + 2}: missing categoryId.` };
    if (!label) return { ok: false, err: `Sub-categories sheet, row ${i + 2}: missing label.` };
    if (subCategoryParent.has(id)) return { ok: false, err: `Sub-categories sheet, row ${i + 2}: duplicate id "${id}".` };
    if (!categoryIds.has(categoryId)) {
      return { ok: false, err: `Sub-categories sheet, row ${i + 2}: categoryId "${categoryId}" is not in the Categories sheet.` };
    }
    subCategoryParent.set(id, categoryId);
    subCategories.push({ id, categoryId, label });
  }

  // Service categories (optional sheet)
  const svcRows = sheetToObjects(serviceCategoriesAoa ?? []);
  const serviceCategories: WorkbookShape["serviceCategories"] = [];
  const serviceCategoryIds = new Set<string>();
  for (let i = 0; i < svcRows.length; i++) {
    const id = svcRows[i].id ?? "";
    const label = svcRows[i].label ?? "";
    if (!id) return { ok: false, err: `Service categories sheet, row ${i + 2}: missing id.` };
    if (!label) return { ok: false, err: `Service categories sheet, row ${i + 2}: missing label.` };
    if (serviceCategoryIds.has(id)) return { ok: false, err: `Service categories sheet, row ${i + 2}: duplicate id "${id}".` };
    serviceCategoryIds.add(id);
    serviceCategories.push({ id, label });
  }

  // Indicators sheet — detect r_code columns before parsing rows
  const indHeaders = (indicatorsAoa[0] ?? []).map((h) => String(h ?? "").trim());

  // Detect code columns in the order they appear.
  // New format: r_code__<label>  →  label embedded
  // Old format: r_code_N  →  positional, label=null
  const codeColumns: Array<{ headerIndex: number; filterHeaderIndex: number; label: string | null }> = [];
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

  // Parse indicator rows
  const indRows = sheetToObjects(indicatorsAoa);
  const indicators: WorkbookShape["indicators"] = [];
  const rawCode: WorkbookShape["rawCode"] = [];
  const usedVarNames = new Set<string>();
  let autoVarCounter = 1;

  for (let i = 0; i < indRows.length; i++) {
    const row = indRows[i];

    const typeLower = (row.type ?? "").toLowerCase();
    let type: "binary" | "numeric";
    if (typeLower === "boolean" || typeLower === "binary") type = "binary";
    else if (typeLower === "numeric") type = "numeric";
    else return { ok: false, err: `Indicators sheet, row ${i + 2}: type must be "binary"/"Boolean" or "numeric"/"Numeric", got "${row.type ?? ""}".` };

    const aggLower = (row.aggregation ?? "").toLowerCase();
    let aggregation: "sum" | "avg";
    if (aggLower === "sum") aggregation = "sum";
    else if (aggLower === "avg" || aggLower === "average" || aggLower === "mean") aggregation = "avg";
    else return { ok: false, err: `Indicators sheet, row ${i + 2}: aggregation must be "sum" or "avg", got "${row.aggregation ?? ""}".` };

    let varName = (row.varName ?? "").trim();
    if (!varName) {
      while (usedVarNames.has(`ind${String(autoVarCounter).padStart(3, "0")}`)) autoVarCounter++;
      varName = `ind${String(autoVarCounter).padStart(3, "0")}`;
      autoVarCounter++;
    }
    if (usedVarNames.has(varName)) return { ok: false, err: `Indicators sheet, row ${i + 2}: duplicate varName "${varName}".` };
    usedVarNames.add(varName);

    const categoryId = (row.categoryId ?? "").trim() || null;
    const subCategoryId = (row.subCategoryId ?? "").trim() || null;
    const serviceCategoryId = (row.serviceCategoryId ?? "").trim() || null;

    if (serviceCategoryId && !serviceCategoryIds.has(serviceCategoryId)) {
      return { ok: false, err: `Indicators sheet, row ${i + 2}: serviceCategoryId "${serviceCategoryId}" not found.` };
    }
    if (categoryId && !categoryIds.has(categoryId)) {
      return { ok: false, err: `Indicators sheet, row ${i + 2}: categoryId "${categoryId}" not found.` };
    }
    if (subCategoryId) {
      const parent = subCategoryParent.get(subCategoryId);
      if (parent === undefined) return { ok: false, err: `Indicators sheet, row ${i + 2}: subCategoryId "${subCategoryId}" not found.` };
      if (!categoryId) return { ok: false, err: `Indicators sheet, row ${i + 2}: subCategoryId requires a categoryId.` };
      if (parent !== categoryId) return { ok: false, err: `Indicators sheet, row ${i + 2}: subCategoryId "${subCategoryId}" belongs to category "${parent}".` };
    }

    indicators.push({ varName, categoryId, subCategoryId, serviceCategoryId, shortLabel: (row.shortLabel ?? "").trim(), definition: (row.definition ?? "").trim(), type, aggregation });

    // Collect raw code values per position using column indices directly
    const rowAoa = (indicatorsAoa[i + 1] ?? []).map((v) => String(v ?? "").trim());
    const positionCode: Array<{ rCode: string; rFilterCode: string }> = codeColumns.map((col) => ({
      rCode: col.headerIndex >= 0 ? (rowAoa[col.headerIndex] ?? "") : "",
      rFilterCode: col.filterHeaderIndex >= 0 ? (rowAoa[col.filterHeaderIndex] ?? "") : "",
    }));
    rawCode.push(positionCode);
  }

  return { ok: true, shape: { categories, subCategories, serviceCategories, indicators, rawCode, xlsxCount, xlsxLabels } };
}

// ============================================================================
// Phase 2: apply time point mapping to produce final code
// ============================================================================

// mapping[xlsxPosition] = platform time point label, or null to skip that position
export function applyTimePointMapping(
  shape: WorkbookShape,
  mapping: Array<string | null>,
): HfaIndicatorCode[] {
  const code: HfaIndicatorCode[] = [];
  for (let i = 0; i < shape.indicators.length; i++) {
    const ind = shape.indicators[i];
    const posCode = shape.rawCode[i] ?? [];
    for (let k = 0; k < shape.xlsxCount; k++) {
      const tp = mapping[k];
      if (!tp) continue;
      const { rCode, rFilterCode } = posCode[k] ?? { rCode: "", rFilterCode: "" };
      if (!rCode && !rFilterCode) continue;
      code.push({ varName: ind.varName, timePoint: tp, rCode, rFilterCode: rFilterCode || undefined });
    }
  }
  return code;
}

// ============================================================================
// Legacy single-step API (kept for backward compat)
// ============================================================================

type ParseResult =
  | { ok: true; data: Omit<HfaWorkbookImport, "replaceAll"> }
  | { ok: false; err: string };

export function parseHfaWorkbook(
  arrayBuffer: ArrayBuffer,
  timePoints: string[],
): ParseResult {
  const detected = detectHfaWorkbookShape(arrayBuffer);
  if (!detected.ok) return detected;
  const { shape } = detected;
  const mapping = timePoints.map((tp, k) => (k < shape.xlsxCount ? tp : null));
  const code = applyTimePointMapping(shape, mapping);
  return { ok: true, data: { categories: shape.categories, subCategories: shape.subCategories, serviceCategories: shape.serviceCategories, indicators: shape.indicators, code } };
}
