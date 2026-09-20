import { readXlsxFileAsSheets } from "./read_xlsx_raw.ts";

export type XlsFormQuestion = {
  questionId: string;
  label: string;
  // Labels of the enclosing begin_group/begin_repeat rows, outermost first.
  // ODK matrix questions carry the stem on the group row and leave each child's
  // own label as a bare suffix ("Infrastructure"), so the group label is what
  // makes the question identifiable: `chal_01_b` and `chal_02_b` are both
  // labelled "Infrastructure" and differ only by their group. Composed into the
  // stored variable label by qualifiedQuestionLabel().
  groupLabels: string[];
  type: "select_one" | "select_multiple" | "integer" | "decimal" | "other";
  listName?: string;
  // Raw XLSForm `constraint` expression (e.g. "(. >= 100 and . <= 999999) or
  // . = -999999"). Carried so numeric don't-know sentinels can be parsed out of
  // it (see parseNumericSentinels). Absent when the form has no constraint column.
  constraint?: string;
};

// `value` is the choices sheet's `name` column: the code stored as
// hfa_variable_values.value, never an identifier.
export type XlsFormChoice = {
  value: string;
  label: string;
};

export type ParsedXlsForm = {
  questions: Map<string, XlsFormQuestion>;
  choiceLists: Map<string, XlsFormChoice[]>;
};

const GROUP_OPEN_TYPES = new Set(["begin_group", "begin_repeat"]);
const GROUP_CLOSE_TYPES = new Set(["end_group", "end_repeat"]);

const SKIP_TYPES = new Set([
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
  // Optional: not every form declares constraints, and non-numeric forms have none.
  const surveyConstraintIdx = surveyHeaders.indexOf("constraint");

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

  const choiceLists = new Map<string, XlsFormChoice[]>();
  for (let i = 1; i < choicesRows.length; i++) {
    const row = choicesRows[i];
    if (!row) continue;
    const listName = String(row[choicesListNameIdx] ?? "").trim();
    const value = String(row[choicesNameIdx] ?? "").trim();
    const label = String(row[choicesLabelIdx] ?? "").trim();
    if (!listName || !value) continue;
    if (!choiceLists.has(listName)) {
      choiceLists.set(listName, []);
    }
    choiceLists.get(listName)!.push({ value, label: label || value });
  }

  const questions = new Map<string, XlsFormQuestion>();
  // Labels of the currently open groups, outermost first. Group rows are handled
  // before the question-id guard below because end_group/end_repeat rows carry
  // no name.
  const groupStack: string[] = [];
  for (let i = 1; i < surveyRows.length; i++) {
    const row = surveyRows[i];
    if (!row) continue;
    const rawType = String(row[surveyTypeIdx] ?? "").trim();
    const questionId = String(row[surveyNameIdx] ?? "").trim();
    const label = cleanSurveyLabel(String(row[surveyLabelIdx] ?? ""));
    const constraint = surveyConstraintIdx >= 0
      ? String(row[surveyConstraintIdx] ?? "").trim()
      : "";
    if (!rawType) continue;

    const typeLower = rawType.toLowerCase();

    if (GROUP_OPEN_TYPES.has(typeLower)) {
      groupStack.push(label);
      continue;
    }
    if (GROUP_CLOSE_TYPES.has(typeLower)) {
      groupStack.pop();
      continue;
    }

    if (!questionId) continue;
    if (SKIP_TYPES.has(typeLower)) continue;

    let type: XlsFormQuestion["type"] = "other";
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

    if (questions.has(questionId)) {
      throw new Error(
        `Duplicate question id '${questionId}' in XLSForm survey sheet`,
      );
    }

    questions.set(questionId, {
      questionId,
      label: label || questionId,
      groupLabels: groupStack.filter((g) => g !== ""),
      type,
      listName,
      constraint: constraint || undefined,
    });
  }

  return { questions, choiceLists };
}

export const XLSFORM_LABEL_SEPARATOR = " — ";

// The dictionary label of the variable a question yields: the question's
// immediate group label followed by its own. Without the group, matrix children
// are unidentifiable ("Infrastructure") and often outright duplicated across
// matrices. Only the immediate group is used. Outer groups are section headings
// ("BLOCK B.2: CHALLENGES...") that add length without disambiguating.
export function qualifiedQuestionLabel(q: XlsFormQuestion): string {
  const parent = q.groupLabels.at(-1);
  return parent ? `${parent}${XLSFORM_LABEL_SEPARATOR}${q.label}` : q.label;
}

// XLSForm labels are authored for on-screen rendering: they carry markup, hard
// line breaks and non-breaking spaces that read as noise once the label is a cell
// in a dictionary table or a fragment of a composed label.
function cleanSurveyLabel(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
