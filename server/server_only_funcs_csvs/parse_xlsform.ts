import { readXlsxFileAsSheets } from "./read_xlsx_raw.ts";

export type XlsFormVarInfo = {
  name: string;
  label: string;
  type: "select_one" | "select_multiple" | "integer" | "decimal" | "other";
  listName?: string;
};

export type XlsFormChoiceInfo = {
  name: string;
  label: string;
};

export type ParsedXlsForm = {
  vars: Map<string, XlsFormVarInfo>;
  choiceLists: Map<string, XlsFormChoiceInfo[]>;
};

const SKIP_TYPES = new Set([
  "begin_group",
  "end_group",
  "begin_repeat",
  "end_repeat",
  "note",
  "start",
  "end",
  "today",
  "deviceid",
  "phonenumber",
  "username",
  "audit",
  "hidden",
]);

export function parseXlsForm(filePath: string): ParsedXlsForm {
  const sheets = readXlsxFileAsSheets(filePath);

  const surveyRows = sheets.get("survey");
  if (!surveyRows || surveyRows.length < 2) {
    throw new Error("XLSForm is missing a 'survey' sheet or it is empty");
  }

  const choicesRows = sheets.get("choices");
  if (!choicesRows || choicesRows.length < 2) {
    throw new Error("XLSForm is missing a 'choices' sheet or it is empty");
  }

  const surveyHeaders = (surveyRows[0] ?? []).map((h) =>
    String(h ?? "").trim()
  );
  const choicesHeaders = (choicesRows[0] ?? []).map((h) =>
    String(h ?? "").trim()
  );

  const surveyTypeIdx = findRequiredColumn(surveyHeaders, "type", "survey");
  const surveyNameIdx = findRequiredColumn(surveyHeaders, "name", "survey");
  const surveyLabelIdx = findLabelColumn(surveyHeaders, "survey");

  const choicesListNameIdx = findRequiredColumn(
    choicesHeaders,
    "list_name",
    "choices",
  );
  const choicesNameIdx = findRequiredColumn(
    choicesHeaders,
    "name",
    "choices",
  );
  const choicesLabelIdx = findLabelColumn(choicesHeaders, "choices");

  const choiceLists = new Map<string, XlsFormChoiceInfo[]>();
  for (let i = 1; i < choicesRows.length; i++) {
    const row = choicesRows[i];
    if (!row) continue;
    const listName = String(row[choicesListNameIdx] ?? "").trim();
    const name = String(row[choicesNameIdx] ?? "").trim();
    const label = String(row[choicesLabelIdx] ?? "").trim();
    if (!listName || !name) continue;
    if (!choiceLists.has(listName)) {
      choiceLists.set(listName, []);
    }
    choiceLists.get(listName)!.push({ name, label: label || name });
  }

  const vars = new Map<string, XlsFormVarInfo>();
  for (let i = 1; i < surveyRows.length; i++) {
    const row = surveyRows[i];
    if (!row) continue;
    const rawType = String(row[surveyTypeIdx] ?? "").trim();
    const name = String(row[surveyNameIdx] ?? "").trim();
    const label = String(row[surveyLabelIdx] ?? "").trim();
    if (!rawType || !name) continue;

    const typeLower = rawType.toLowerCase();
    if (SKIP_TYPES.has(typeLower)) continue;

    let type: XlsFormVarInfo["type"] = "other";
    let listName: string | undefined;

    if (typeLower.startsWith("select_one ")) {
      type = "select_one";
      listName = rawType.substring("select_one ".length).trim().split(" ")[0];
    } else if (typeLower.startsWith("select_multiple ")) {
      type = "select_multiple";
      listName = rawType
        .substring("select_multiple ".length)
        .trim()
        .split(" ")[0];
    } else if (typeLower === "integer") {
      type = "integer";
    } else if (typeLower === "decimal") {
      type = "decimal";
    }

    if (vars.has(name)) {
      throw new Error(
        `Duplicate variable name '${name}' in XLSForm survey sheet`,
      );
    }

    vars.set(name, {
      name,
      label: label || name,
      type,
      listName,
    });
  }

  return { vars, choiceLists };
}

function findRequiredColumn(
  headers: string[],
  columnName: string,
  sheetName: string,
): number {
  const idx = headers.indexOf(columnName);
  if (idx < 0) {
    throw new Error(
      `Required column '${columnName}' not found in XLSForm '${sheetName}' sheet`,
    );
  }
  return idx;
}

function findLabelColumn(headers: string[], sheetName: string): number {
  const exactIdx = headers.indexOf("label");
  if (exactIdx >= 0) return exactIdx;

  const labelVariantIdx = headers.findIndex((h) => h?.startsWith("label::"));
  if (labelVariantIdx >= 0) return labelVariantIdx;

  const labelColonIdx = headers.findIndex((h) => h?.startsWith("label:"));
  if (labelColonIdx >= 0) return labelColonIdx;

  throw new Error(
    `No label column found in XLSForm '${sheetName}' sheet. Expected 'label' or 'label::*'`,
  );
}
