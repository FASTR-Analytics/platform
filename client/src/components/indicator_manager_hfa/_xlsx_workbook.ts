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
  for (const sc of subCategories) {
    subCategoriesAoa.push([sc.id, sc.categoryId, sc.label]);
  }

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
    "varName",
    "categoryId",
    "subCategoryId",
    "serviceCategoryId",
    "shortLabel",
    "definition",
    "type",
    "aggregation",
  ];
  for (let k = 0; k < timePoints.length; k++) {
    indicatorHeaders.push(`r_code_${k + 1}`, `r_filter_code_${k + 1}`);
  }
  const indicatorsAoa: string[][] = [indicatorHeaders];
  for (const ind of indicators) {
    const row: string[] = [
      ind.varName,
      ind.categoryId ?? "",
      ind.subCategoryId ?? "",
      ind.serviceCategoryId ?? "",
      ind.shortLabel,
      ind.definition,
      ind.type,
      ind.aggregation,
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
// Parse + validate (import) — all in the browser
// ============================================================================

type ParseResult =
  | { ok: true; data: Omit<HfaWorkbookImport, "replaceAll"> }
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

export function parseHfaWorkbook(
  arrayBuffer: ArrayBuffer,
  timePoints: string[], // already sorted
): ParseResult {
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
    return {
      ok: false,
      err: 'Workbook is missing an "Indicators" sheet. Expected sheets: Categories, Sub-categories, Indicators.',
    };
  }

  // Categories
  const catRows = sheetToObjects(categoriesAoa ?? []);
  const categories: { id: string; label: string }[] = [];
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
  const subCategories: { id: string; categoryId: string; label: string }[] = [];
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

  // Service categories (sheet is optional; missing means none)
  const svcRows = sheetToObjects(serviceCategoriesAoa ?? []);
  const serviceCategories: { id: string; label: string }[] = [];
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

  // Indicators
  const indRows = sheetToObjects(indicatorsAoa);
  const indicators: HfaWorkbookImport["indicators"] = [];
  const code: HfaIndicatorCode[] = [];
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
      return { ok: false, err: `Indicators sheet, row ${i + 2}: serviceCategoryId "${serviceCategoryId}" is not in the Service categories sheet.` };
    }
    if (categoryId && !categoryIds.has(categoryId)) {
      return { ok: false, err: `Indicators sheet, row ${i + 2}: categoryId "${categoryId}" is not in the Categories sheet.` };
    }
    if (subCategoryId) {
      const parent = subCategoryParent.get(subCategoryId);
      if (parent === undefined) return { ok: false, err: `Indicators sheet, row ${i + 2}: subCategoryId "${subCategoryId}" is not in the Sub-categories sheet.` };
      if (!categoryId) return { ok: false, err: `Indicators sheet, row ${i + 2}: subCategoryId "${subCategoryId}" requires a categoryId.` };
      if (parent !== categoryId) return { ok: false, err: `Indicators sheet, row ${i + 2}: subCategoryId "${subCategoryId}" belongs to category "${parent}", not "${categoryId}".` };
    }

    indicators.push({
      varName,
      categoryId,
      subCategoryId,
      serviceCategoryId,
      shortLabel: (row.shortLabel ?? "").trim(),
      definition: (row.definition ?? "").trim(),
      type,
      aggregation,
    });

    for (let k = 0; k < timePoints.length; k++) {
      const rCode = (row[`r_code_${k + 1}`] ?? "").trim();
      const rFilterCode = (row[`r_filter_code_${k + 1}`] ?? "").trim();
      if (!rCode && !rFilterCode) continue;
      code.push({
        varName,
        timePoint: timePoints[k],
        rCode,
        rFilterCode: rFilterCode || undefined,
      });
    }
  }

  return { ok: true, data: { categories, subCategories, serviceCategories, indicators, code } };
}
