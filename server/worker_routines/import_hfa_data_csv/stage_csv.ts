import { Sql } from "postgres";
import { escapeSqlString } from "../../db/utils.ts";
import {
  classifyChoice,
  classifyNumericSentinel,
  isReservedHfaId,
  parseNumericSentinels,
  type DatasetHfaCsvStagingResult,
  type HfaCsvMappingParams,
} from "lib";
import { getHfaRowScanComponents } from "../../server_only_funcs_csvs/scan_hfa_rows.ts";
import {
  parseXlsForm,
  qualifiedQuestionLabel,
  XLSFORM_LABEL_SEPARATOR,
  type XlsFormChoice,
  type XlsFormQuestion,
} from "../../server_only_funcs_csvs/parse_xlsform.ts";

// Per-run staging tables (PLAN_DHIS2_IMPORTER_CONSOLIDATION B4): staging
// output must survive a needs_review hold across other imports running in
// between, so every table carries a _run_{runId} suffix. The three "final"
// tables feed the integrate leg; the three intermediates are dropped as soon
// as staging finishes. This replaces the fixed staging-table names, and is
// what makes releasing the single-running slot on needs_review safe.

export function hfaStagingTableNames(runId: number): {
  raw: string;
  validFacilities: string;
  keepRows: string;
  final: string;
  dictVars: string;
  dictValues: string;
} {
  const id = Math.floor(runId);
  return {
    raw: `uploaded_hfa_staging_raw_run_${id}`,
    validFacilities: `uploaded_hfa_staging_validfac_run_${id}`,
    keepRows: `uploaded_hfa_staging_keeprows_run_${id}`,
    final: `uploaded_hfa_data_staging_ready_for_integration_run_${id}`,
    dictVars: `uploaded_hfa_dictionary_vars_staging_run_${id}`,
    dictValues: `uploaded_hfa_dictionary_values_staging_run_${id}`,
  };
}

export async function dropHfaStagingTables(
  db: Sql,
  runId: number,
  args: { keepFinal: boolean },
): Promise<void> {
  const names = hfaStagingTableNames(runId);
  const toDrop = [names.raw, names.validFacilities, names.keepRows];
  if (!args.keepFinal) {
    toDrop.push(names.final, names.dictVars, names.dictValues);
  }
  for (const name of toDrop) {
    try {
      await db.unsafe(`DROP TABLE IF EXISTS ${name}`);
    } catch {
      // Cleanup is best-effort; a leftover is dropped by the boot sweep.
    }
  }
}

// The staging internals relocated from the old stage_hfa_data_csv worker:
// parse the XLSForm, stream the CSV wide→long with select_multiple expansion,
// resolve duplicates, validate facilities, and build the data + dictionary
// staging tables. Semantics unchanged; only the table names (per-run) and the
// progress transport (callback instead of attempt-row writes) differ. Never
// throws on dropped rows: the caller's clean-condition gate decides what a
// nonzero drop count means.
export async function stageHfaCsvIntoTables(args: {
  importDb: Sql;
  csvFilePath: string;
  csvFileName: string;
  xlsFormFilePath: string;
  mappings: HfaCsvMappingParams;
  runId: number;
  onProgress: (percent: number) => void;
}): Promise<DatasetHfaCsvStagingResult> {
  const {
    importDb,
    csvFilePath,
    csvFileName,
    xlsFormFilePath,
    mappings,
    runId,
    onProgress,
  } = args;
  const names = hfaStagingTableNames(runId);

  const timePoint = mappings.timePoint;
  const rowFilters = mappings.rowFilters;
  const dedupStrategy = mappings.dedupStrategy;
  const dedupOverrides = mappings.dedupOverrides;

  const xlsForm = parseXlsForm(xlsFormFilePath);

  // Streaming components (filter + row-number scan shared with the wizard's
  // stateless duplicates preview route).
  const { headers, facilityIdIndex, processFilteredRows } =
    await getHfaRowScanComponents(csvFilePath, mappings.facilityIdColumn, rowFilters);

  // Match CSV columns to XLSForm questions.
  type CsvQuestionMapping = {
    csvHeader: string;
    csvIndex: number;
    question: XlsFormQuestion;
    choices?: XlsFormChoice[];
  };

  const csvQuestionMappings: CsvQuestionMapping[] = [];
  const unmatchedCsvCols: string[] = [];

  for (let i = 0; i < headers.length; i++) {
    if (i === facilityIdIndex) continue;
    const csvHeader = headers[i];
    // An ODK export header is the question's path through its groups,
    // "section_a/subsection/question_id"; the last segment is the question id.
    const questionId = csvHeader.includes("/")
      ? csvHeader.substring(csvHeader.lastIndexOf("/") + 1)
      : csvHeader;

    const question = xlsForm.questions.get(questionId);
    if (!question) {
      unmatchedCsvCols.push(csvHeader);
      continue;
    }

    // Only include select_one, select_multiple, integer, decimal
    if (
      question.type !== "select_one" &&
      question.type !== "select_multiple" &&
      question.type !== "integer" &&
      question.type !== "decimal"
    ) {
      continue;
    }

    const mapping: CsvQuestionMapping = {
      csvHeader,
      csvIndex: i,
      question,
    };

    if (
      (question.type === "select_one" || question.type === "select_multiple") &&
      question.listName
    ) {
      mapping.choices = xlsForm.choiceLists.get(question.listName);
    }

    csvQuestionMappings.push(mapping);
  }

  const variableIds = csvQuestionMappings.flatMap((m) => {
    const { questionId } = m.question;
    if (m.question.type === "select_multiple") {
      return (m.choices ?? []).map((choice) => `${questionId}_${choice.value}`);
    }
    return [questionId];
  });
  // Reject variable ids that collide with how indicator R code is interpreted:
  // `and`/`or` operator aliases, R keywords, the common functions the
  // identifier extractor filters, or with a column the module script owns
  // (`weight`, `time_point`, `facility_*`, ...). A variable id `and`/`sum`/`if`
  // would otherwise be silently rewritten or dropped, and `weight`/`time_point`
  // would collide with or shadow the script's own column (single source:
  // isReservedHfaId).
  const reservedCollisions = variableIds.filter(isReservedHfaId);
  if (reservedCollisions.length > 0) {
    throw new Error(
      `The variable id "${reservedCollisions[0]}" is reserved (it collides with a function or operator used in indicator code, or with a column the analysis script generates). Rename the question in the XLSForm, and its column in the CSV, and re-upload.`,
    );
  }

  const nCsvColsNotInXlsForm = unmatchedCsvCols.length;

  // Count XLSForm questions not in CSV (informational)
  const matchedQuestionIds = new Set(
    csvQuestionMappings.map((m) => m.question.questionId),
  );
  let nXlsFormQuestionsNotInCsv = 0;
  for (const questionId of xlsForm.questions.keys()) {
    if (!matchedQuestionIds.has(questionId)) nXlsFormQuestionsNotInCsv++;
  }

  const nSelectMultipleExpanded = csvQuestionMappings.filter(
    (m) => m.question.type === "select_multiple",
  ).length;

  const dateImported = new Date().toISOString();

  const fileInfo = await Deno.stat(csvFilePath);
  const fileSizeBytes = fileInfo.size;
  let lastProgressUpdate = 1;

  // Clean up any leftover tables from a previous crashed run of this id.
  await dropHfaStagingTables(importDb, runId, { keepFinal: false });

  onProgress(1);

  // row_seq = 1-based position of the source data row in the file, stamped by
  // the scanner.
  await importDb.unsafe(`
CREATE UNLOGGED TABLE ${names.raw} (
  facility_id TEXT NOT NULL,
  time_point TEXT NOT NULL,
  variable_id TEXT NOT NULL,
  value TEXT NOT NULL,
  row_seq BIGINT NOT NULL
)`);

  let rowBuffer: string[] = [];
  const BUFFER_SIZE = 100000;
  const facilityRowNumbers = new Map<string, number[]>();
  const cleanedTimePoint = timePoint.trim();

  // Values are kept verbatim (only trimmed); escaping happens exactly once,
  // when the SQL VALUES tuple is built
  const tup = (...vals: string[]) =>
    `(${vals.map((v) => `'${escapeSqlString(v)}'`).join(",")})`;

  const dataTup = (
    facilityId: string,
    variableId: string,
    value: string,
    rowSeq: number,
  ) =>
    `('${escapeSqlString(facilityId)}','${escapeSqlString(cleanedTimePoint)}','${escapeSqlString(variableId)}','${escapeSqlString(value)}',${rowSeq})`;

  const flushBuffer = async () => {
    if (rowBuffer.length === 0) return;
    await importDb.unsafe(
      `INSERT INTO ${names.raw} (facility_id, time_point, variable_id, value, row_seq) VALUES ${rowBuffer.join(",")}`,
    );
    rowBuffer = [];
  };

  // Process CSV rows: wide to long, with select_multiple expansion. All
  // surviving (post-filter) rows are inserted, duplicates included; the
  // keep-set join below picks one row per facility.
  const scanTotals = await processFilteredRows(
    async (
      row: string[],
      rowNumber: number,
      facilityId: string,
      bytesRead: number,
    ) => {
      const existingRows = facilityRowNumbers.get(facilityId);
      if (existingRows) {
        existingRows.push(rowNumber);
      } else {
        facilityRowNumbers.set(facilityId, [rowNumber]);
      }

      for (const mapping of csvQuestionMappings) {
        const valueRaw = row[mapping.csvIndex] || "";
        const value = valueRaw.trim();

        if (mapping.question.type === "select_multiple" && mapping.choices) {
          // Expand to binary variables. An unanswered parent stays missing
          // on every expanded variable; a "don't know" (-99) answer marks the
          // unselected choices -99 instead of 0, so downstream sentinel
          // handling sees it (PLAN_HFA_FEATURES.md)
          const selectedCodes = new Set(
            value ? value.split(" ").filter((s) => s.length > 0) : [],
          );
          const unselectedValue =
            selectedCodes.size === 0
              ? ""
              : selectedCodes.has("-99")
                ? "-99"
                : "0";
          for (const choice of mapping.choices) {
            const expandedVariableId = `${mapping.question.questionId}_${choice.value}`;
            const expandedValue = selectedCodes.has(choice.value)
              ? "1"
              : unselectedValue;
            rowBuffer.push(
              dataTup(facilityId, expandedVariableId, expandedValue, rowNumber),
            );
          }
        } else {
          rowBuffer.push(
            dataTup(facilityId, mapping.question.questionId, value, rowNumber),
          );
        }
      }

      if (rowBuffer.length >= BUFFER_SIZE) {
        await flushBuffer();
        const progress = Math.floor((bytesRead / fileSizeBytes) * 84) + 1;
        if (progress > lastProgressUpdate) {
          onProgress(progress);
          lastProgressUpdate = progress;
        }
      }
    },
  );

  await flushBuffer();

  const totalRows = scanTotals.nRowsInFile;
  const missingFacilityIdCount = scanTotals.nRowsMissingFacilityId;
  const nRowsFilteredOut = scanTotals.nRowsFilteredOut;

  // Validate overrides against the post-filter duplicate structure: a stale
  // override (from an edited file or changed filters) fails staging loudly
  // rather than silently falling back to the rule.
  const overrideByFacility = new Map<string, number>();
  for (const override of dedupOverrides) {
    const rows = facilityRowNumbers.get(override.facilityId);
    if (!rows || rows.length < 2 || !rows.includes(override.keepRow)) {
      throw new Error(
        `Duplicate-resolution override for facility "${override.facilityId}" (keep row ${override.keepRow}) no longer matches the file and filters. Start the import again and review the duplicates.`,
      );
    }
    overrideByFacility.set(override.facilityId, override.keepRow);
  }

  // Resolve kept row per facility: override if present, else first/last in
  // file order (row numbers are ascending per facility by construction)
  let survivingRows = 0;
  const keepTuples: string[] = [];
  for (const [facilityId, rows] of facilityRowNumbers) {
    survivingRows += rows.length;
    const keepRow =
      overrideByFacility.get(facilityId) ??
      (dedupStrategy === "first" ? rows[0] : rows[rows.length - 1]);
    keepTuples.push(`('${escapeSqlString(facilityId)}',${keepRow})`);
  }
  const duplicateRowsCount = survivingRows - facilityRowNumbers.size;
  const rowsProcessed = facilityRowNumbers.size;

  await importDb.unsafe(`
CREATE UNLOGGED TABLE ${names.keepRows} (
  facility_id TEXT NOT NULL,
  keep_seq BIGINT NOT NULL
)`);
  for (let i = 0; i < keepTuples.length; i += 1000) {
    const batch = keepTuples.slice(i, i + 1000);
    await importDb.unsafe(
      `INSERT INTO ${names.keepRows} (facility_id, keep_seq) VALUES ${batch.join(",")}`,
    );
  }

  onProgress(88);

  // Validate facilities
  await importDb.unsafe(`
CREATE UNLOGGED TABLE ${names.validFacilities} AS
SELECT DISTINCT facility_id FROM facilities_hfa
WHERE EXISTS (
  SELECT 1 FROM ${names.raw} t
  WHERE t.facility_id = facilities_hfa.facility_id
)`);

  onProgress(90);

  // Final staging table with validated facilities, keeping only the resolved
  // row per facility
  await importDb.unsafe(`
CREATE TABLE ${names.final} AS
SELECT
  t.facility_id,
  t.time_point,
  t.variable_id,
  t.value
FROM ${names.raw} t
JOIN ${names.keepRows} k
  ON k.facility_id = t.facility_id AND t.row_seq = k.keep_seq
WHERE EXISTS (
  SELECT 1 FROM ${names.validFacilities} vf
  WHERE vf.facility_id = t.facility_id
)`);

  await importDb.unsafe(`
ALTER TABLE ${names.final}
ADD PRIMARY KEY (facility_id, time_point, variable_id)`);

  onProgress(93);

  // Dictionary staging tables
  await importDb.unsafe(`
CREATE UNLOGGED TABLE ${names.dictVars} (
  time_point TEXT NOT NULL,
  variable_id TEXT NOT NULL,
  variable_label TEXT NOT NULL,
  variable_type TEXT NOT NULL,
  PRIMARY KEY (time_point, variable_id)
)`);
  await importDb.unsafe(`
CREATE UNLOGGED TABLE ${names.dictValues} (
  time_point TEXT NOT NULL,
  variable_id TEXT NOT NULL,
  value TEXT NOT NULL,
  value_label TEXT NOT NULL,
  sentinel_class TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (time_point, variable_id, value)
)`);

  const dictVariableRows: string[] = [];
  const dictValueRows: string[] = [];

  for (const mapping of csvQuestionMappings) {
    const variableId = mapping.question.questionId;
    const variableLabel = qualifiedQuestionLabel(mapping.question);
    const variableType = mapping.question.type;

    if (mapping.question.type === "select_multiple" && mapping.choices) {
      const dkChoice = mapping.choices.find((c) => c.value === "-99");
      for (const choice of mapping.choices) {
        const expandedVariableId = `${variableId}_${choice.value}`;
        const compositeLabel =
          `${variableLabel}${XLSFORM_LABEL_SEPARATOR}${choice.label}`.trim();
        dictVariableRows.push(
          tup(
            cleanedTimePoint,
            expandedVariableId,
            compositeLabel,
            "select_multiple_binary",
          ),
        );
        // "Yes"/"No" are substantive; only the carried "-99" is a sentinel.
        dictValueRows.push(tup(cleanedTimePoint, expandedVariableId, "1", "Yes", ""));
        dictValueRows.push(tup(cleanedTimePoint, expandedVariableId, "0", "No", ""));
        if (dkChoice && choice.value !== "-99") {
          const dkLabel = dkChoice.label.trim();
          dictValueRows.push(
            tup(
              cleanedTimePoint,
              expandedVariableId,
              "-99",
              dkLabel,
              classifyChoice("-99", dkLabel) ?? "",
            ),
          );
        }
      }
    } else if (mapping.question.type === "select_one" && mapping.choices) {
      dictVariableRows.push(tup(cleanedTimePoint, variableId, variableLabel, variableType));
      for (const choice of mapping.choices) {
        const code = choice.value;
        const label = choice.label.trim();
        dictValueRows.push(
          tup(
            cleanedTimePoint,
            variableId,
            code,
            label,
            classifyChoice(code, label) ?? "",
          ),
        );
      }
    } else {
      dictVariableRows.push(tup(cleanedTimePoint, variableId, variableLabel, variableType));
      // Numeric variables have no choice list; their don't-know sentinel lives in
      // the XLSForm constraint (e.g. ". = -999999"). Synthesize a dictionary
      // row so the sentinel and its class are captured like a choice code.
      for (const sv of parseNumericSentinels(mapping.question.constraint ?? "")) {
        const cls = classifyNumericSentinel(sv);
        const label = cls === "dont_know" ? "Don't know" : "Reserved value";
        dictValueRows.push(tup(cleanedTimePoint, variableId, sv, label, cls));
      }
    }
  }

  for (let i = 0; i < dictVariableRows.length; i += 1000) {
    const batch = dictVariableRows.slice(i, i + 1000);
    await importDb.unsafe(
      `INSERT INTO ${names.dictVars} (time_point, variable_id, variable_label, variable_type) VALUES ${batch.join(",")}`,
    );
  }
  for (let i = 0; i < dictValueRows.length; i += 1000) {
    const batch = dictValueRows.slice(i, i + 1000);
    await importDb.unsafe(
      `INSERT INTO ${names.dictValues} (time_point, variable_id, value, value_label, sentinel_class) VALUES ${batch.join(",")}`,
    );
  }

  onProgress(95);

  const validRowCount = (
    await importDb<{ count: number }[]>`
SELECT COUNT(*)::int as count FROM ${importDb.unsafe(names.final)}`
  )[0].count;

  const invalidFacilityNotFoundCount = (
    await importDb<{ count: number }[]>`
SELECT COUNT(DISTINCT facility_id)::int as count
FROM ${importDb.unsafe(names.raw)}
WHERE NOT EXISTS (
  SELECT 1 FROM ${importDb.unsafe(names.validFacilities)} vf
  WHERE vf.facility_id = ${importDb.unsafe(names.raw)}.facility_id
)`
  )[0].count;

  // The intermediates are done; the three tables the integrate leg reads stay.
  await dropHfaStagingTables(importDb, runId, { keepFinal: true });

  return {
    dateImported,
    assetFileName: csvFileName,
    nRowsInFile: totalRows,
    nRowsValid: rowsProcessed - invalidFacilityNotFoundCount,
    nRowsInvalidMissingFacilityId: missingFacilityIdCount,
    nRowsInvalidFacilityNotFound: invalidFacilityNotFoundCount,
    nRowsDuplicated: duplicateRowsCount,
    nRowsFilteredOut,
    dedupStrategy,
    nDedupOverridesApplied: dedupOverrides.length,
    nRowsTotal: validRowCount,
    timePoint,
    nDictionaryVariables: dictVariableRows.length,
    nDictionaryValues: dictValueRows.length,
    nXlsFormQuestionsNotInCsv,
    nCsvColsNotInXlsForm,
    nSelectMultipleExpanded,
  };
}
