import { Sql } from "postgres";
import { escapeSqlString } from "../../db/utils.ts";
import {
  classifyChoice,
  classifyNumericSentinel,
  type DatasetHfaCsvStagingResult,
  type HfaCsvMappingParams,
  isReservedHfaId,
  parseNumericSentinels,
  throwIfErrWithData,
} from "lib";
import { getStructureSchema } from "../../db/instance/config.ts";
import {
  countHfaFacilityChanges,
  readHfaFacilityChangeSet,
  resolveHfaChangeDecisions,
} from "../../db/instance/hfa_facilities.ts";
import {
  createHfaFacilityCollector,
  getHfaRowScanComponents,
  resolveHfaKeptRows,
} from "../../server_only_funcs_csvs/scan_hfa_rows.ts";
import { findXlsFormQuestionForHeader } from "../../server_only_funcs_csvs/resolve_odk_labels.ts";
import {
  type ParsedXlsForm,
  parseXlsForm,
  qualifiedQuestionLabel,
  XLSFORM_LABEL_SEPARATOR,
  type XlsFormChoice,
  type XlsFormQuestion,
} from "../../server_only_funcs_csvs/parse_xlsform.ts";

// Per-run staging tables: staging output must survive a needs_review hold
// across other imports running in between, so every table carries a
// _run_{runId} suffix. The four "final" tables feed the integrate leg; the two
// intermediates are dropped as soon as staging finishes. This is what makes
// releasing the single-running slot on needs_review safe.

const DIAGNOSTIC_SAMPLE_SIZE = 10;

export function hfaStagingTableNames(runId: number): {
  raw: string;
  keepRows: string;
  final: string;
  dictVars: string;
  dictValues: string;
  facilities: string;
} {
  const id = Math.floor(runId);
  return {
    raw: `uploaded_hfa_staging_raw_run_${id}`,
    keepRows: `uploaded_hfa_staging_keeprows_run_${id}`,
    final: `uploaded_hfa_data_staging_ready_for_integration_run_${id}`,
    dictVars: `uploaded_hfa_dictionary_vars_staging_run_${id}`,
    dictValues: `uploaded_hfa_dictionary_values_staging_run_${id}`,
    facilities: `uploaded_hfa_staging_facilities_run_${id}`,
  };
}

export async function dropHfaStagingTables(
  db: Sql,
  runId: number,
  args: { keepFinal: boolean },
): Promise<void> {
  const names = hfaStagingTableNames(runId);
  const toDrop = [names.raw, names.keepRows];
  if (!args.keepFinal) {
    toDrop.push(
      names.final,
      names.dictVars,
      names.dictValues,
      names.facilities,
    );
  }
  for (const name of toDrop) {
    try {
      await db.unsafe(`DROP TABLE IF EXISTS ${name}`);
    } catch {
      // Cleanup is best-effort; a leftover is dropped by the boot sweep.
    }
  }
}

// The HFA clean condition: every row has a facility id, every new facility
// has a complete admin tuple, and something staged. Duplicates do NOT gate:
// they are RESOLVED at wizard time by the dedup strategy/overrides, so a
// nonzero count is normal. Filtered-out rows do not gate either: row filters
// are user-authored intent.
export function isCleanHfaStaging(result: DatasetHfaCsvStagingResult): boolean {
  return (
    result.nRowsInvalidMissingFacilityId === 0 &&
    (result.facilitiesWithoutAdminTuple?.count ?? 0) === 0 &&
    result.nRowsTotal > 0
  );
}

// Parses the XLSForm, streams the CSV wide→long with select_multiple
// expansion, resolves duplicates, reads each kept row's facility values, checks
// the decisions against the registry, and builds the data, dictionary and
// facility staging tables. A decision that no longer matches the file and the
// registry throws, naming the facilities. Never throws on rows with no
// facility id or on new facilities with an incomplete admin tuple: the
// caller's clean-condition gate decides what those counts mean.
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
  const resSchema = await getStructureSchema(importDb, "hfa");
  throwIfErrWithData(resSchema);

  // Streaming components (filter + row-number scan shared with the wizard's
  // stateless previews).
  const {
    headers,
    encodedHeaderToIndexMap,
    facilityIdIndex,
    processFilteredRows,
  } = await getHfaRowScanComponents(
    csvFilePath,
    mappings.facilityIdColumn,
    rowFilters,
  );
  const facilityCollector = createHfaFacilityCollector({
    headers,
    encodedHeaderToIndexMap,
    facilityColumns: mappings.facilityColumns,
    adminDepth: resSchema.data.adminDepth,
    xlsForm,
    contextHeaders: [],
  });

  const {
    csvQuestionMappings,
    csvColsNotInXlsForm,
    xlsFormQuestionsNotInCsv,
  } = matchCsvColumnsToXlsForm(headers, facilityIdIndex, xlsForm);

  if (csvQuestionMappings.length === 0) {
    const nStagedTypeQuestions = [...xlsForm.questions.values()].filter((q) =>
      STAGED_QUESTION_TYPES.has(q.type)
    ).length;
    throw new Error(
      `No CSV column matches a question in the XLSForm: ${headers.length} columns in the file, ` +
        `${nStagedTypeQuestions} questions of a staged type in the form, 0 matched. ` +
        `The CSV headers and the XLSForm 'name' column must carry the same question ids. ` +
        `First columns: ${csvColsNotInXlsForm.slice(0, 5).join(", ")}. ` +
        `First questions: ${xlsFormQuestionsNotInCsv.slice(0, 5).join(", ")}.`,
    );
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
      `The variable id "${
        reservedCollisions[0]
      }" is reserved (it collides with a function or operator used in indicator code, or with a column the analysis script generates). Rename the question in the XLSForm, and its column in the CSV, and re-upload.`,
    );
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
    `('${escapeSqlString(facilityId)}','${
      escapeSqlString(cleanedTimePoint)
    }','${escapeSqlString(variableId)}','${escapeSqlString(value)}',${rowSeq})`;

  const flushBuffer = async () => {
    if (rowBuffer.length === 0) return;
    await importDb.unsafe(
      `INSERT INTO ${names.raw} (facility_id, time_point, variable_id, value, row_seq) VALUES ${
        rowBuffer.join(",")
      }`,
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
      facilityCollector.add(row, rowNumber, facilityId);

      for (const mapping of csvQuestionMappings) {
        const valueRaw = row[mapping.csvIndex] || "";
        const value = valueRaw.trim();

        if (mapping.question.type === "select_multiple" && mapping.choices) {
          // Expand to binary variables. An unanswered parent stays missing
          // on every expanded variable; a "don't know" (-99) answer marks the
          // unselected choices -99 instead of 0, so downstream sentinel
          // handling sees it.
          const selectedCodes = new Set(
            value ? value.split(" ").filter((s) => s.length > 0) : [],
          );
          const unselectedValue = selectedCodes.size === 0
            ? ""
            : selectedCodes.has("-99")
            ? "-99"
            : "0";
          for (const choice of mapping.choices) {
            const expandedVariableId =
              `${mapping.question.questionId}_${choice.value}`;
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

  const keptRows = resolveHfaKeptRows(
    facilityRowNumbers,
    dedupStrategy,
    dedupOverrides,
  );
  let survivingRows = 0;
  for (const rows of facilityRowNumbers.values()) {
    survivingRows += rows.length;
  }
  const keepTuples = [...keptRows].map(([facilityId, keepRow]) =>
    `('${escapeSqlString(facilityId)}',${keepRow})`
  );
  const duplicateRowsCount = survivingRows - facilityRowNumbers.size;
  const rowsProcessed = facilityRowNumbers.size;

  const { facilities, labelResolution } = facilityCollector.finish(keptRows);
  const { changeSet } = await readHfaFacilityChangeSet(importDb, {
    file: facilities,
    facilityColumns: mappings.facilityColumns,
    schema: resSchema.data,
    timePoint: cleanedTimePoint,
  });
  const facilityChanges = countHfaFacilityChanges(
    changeSet.changes,
    resolveHfaChangeDecisions(changeSet.changes, mappings.facilityChanges),
  );
  const withoutAdminTuple = changeSet.newFacilitiesWithoutAdminTuple;

  // known records what staging found in the registry, so integration can
  // tell a facility removed during a hold from one the file brought.
  const newFacilityIds = new Set([
    ...changeSet.newFacilities.map((f) => f.facilityId),
    ...withoutAdminTuple,
  ]);
  await importDb.unsafe(`
CREATE UNLOGGED TABLE ${names.facilities} (
  facility_id TEXT PRIMARY KEY,
  facility TEXT NOT NULL,
  known BOOLEAN NOT NULL
)`);
  // postgres.js types a boolean[] parameter as one boolean ("cannot cast type
  // boolean to boolean[]"), so the flags travel as text and are cast on the
  // server.
  for (let i = 0; i < facilities.length; i += 1000) {
    const batch = facilities.slice(i, i + 1000);
    await importDb`
      INSERT INTO ${importDb(names.facilities)} (facility_id, facility, known)
      SELECT * FROM unnest(
        ${batch.map((f) => f.facilityId)}::text[],
        ${batch.map((f) => JSON.stringify(f))}::text[],
        ${
      batch.map((f) => String(!newFacilityIds.has(f.facilityId)))
    }::text[]::boolean[]
      )
    `;
  }

  await importDb.unsafe(`
CREATE UNLOGGED TABLE ${names.keepRows} (
  facility_id TEXT NOT NULL,
  keep_seq BIGINT NOT NULL
)`);
  for (let i = 0; i < keepTuples.length; i += 1000) {
    const batch = keepTuples.slice(i, i + 1000);
    await importDb.unsafe(
      `INSERT INTO ${names.keepRows} (facility_id, keep_seq) VALUES ${
        batch.join(",")
      }`,
    );
  }

  onProgress(90);

  // Final staging table: only the kept row per facility
  await importDb.unsafe(`
CREATE TABLE ${names.final} AS
SELECT
  t.facility_id,
  t.time_point,
  t.variable_id,
  t.value
FROM ${names.raw} t
JOIN ${names.keepRows} k
  ON k.facility_id = t.facility_id AND t.row_seq = k.keep_seq`);

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
        dictValueRows.push(
          tup(cleanedTimePoint, expandedVariableId, "1", "Yes", ""),
        );
        dictValueRows.push(
          tup(cleanedTimePoint, expandedVariableId, "0", "No", ""),
        );
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
      dictVariableRows.push(
        tup(cleanedTimePoint, variableId, variableLabel, variableType),
      );
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
      dictVariableRows.push(
        tup(cleanedTimePoint, variableId, variableLabel, variableType),
      );
      // Numeric variables have no choice list; their don't-know sentinel lives in
      // the XLSForm constraint (e.g. ". = -999999"). Synthesize a dictionary
      // row so the sentinel and its class are captured like a choice code.
      for (
        const sv of parseNumericSentinels(mapping.question.constraint ?? "")
      ) {
        const cls = classifyNumericSentinel(sv);
        const label = cls === "dont_know" ? "Don't know" : "Reserved value";
        dictValueRows.push(tup(cleanedTimePoint, variableId, sv, label, cls));
      }
    }
  }

  for (let i = 0; i < dictVariableRows.length; i += 1000) {
    const batch = dictVariableRows.slice(i, i + 1000);
    await importDb.unsafe(
      `INSERT INTO ${names.dictVars} (time_point, variable_id, variable_label, variable_type) VALUES ${
        batch.join(",")
      }`,
    );
  }
  for (let i = 0; i < dictValueRows.length; i += 1000) {
    const batch = dictValueRows.slice(i, i + 1000);
    await importDb.unsafe(
      `INSERT INTO ${names.dictValues} (time_point, variable_id, value, value_label, sentinel_class) VALUES ${
        batch.join(",")
      }`,
    );
  }

  onProgress(95);

  const validRowCount = (
    await importDb<{ count: number }[]>`
SELECT COUNT(*)::int as count FROM ${importDb.unsafe(names.final)}`
  )[0].count;

  // The intermediates are done; the four tables the integrate leg reads stay.
  await dropHfaStagingTables(importDb, runId, { keepFinal: true });

  return {
    dateImported,
    assetFileName: csvFileName,
    nRowsInFile: totalRows,
    nRowsValid: rowsProcessed - withoutAdminTuple.length,
    nRowsInvalidMissingFacilityId: missingFacilityIdCount,
    nRowsDuplicated: duplicateRowsCount,
    nRowsFilteredOut,
    dedupStrategy,
    nDedupOverridesApplied: dedupOverrides.length,
    nRowsTotal: validRowCount,
    timePoint,
    nDictionaryVariables: dictVariableRows.length,
    nDictionaryValues: dictValueRows.length,
    nXlsFormQuestionsNotInCsv: xlsFormQuestionsNotInCsv.length,
    xlsFormQuestionsNotInCsvSample: xlsFormQuestionsNotInCsv.slice(
      0,
      DIAGNOSTIC_SAMPLE_SIZE,
    ),
    nCsvColsNotInXlsForm: csvColsNotInXlsForm.length,
    csvColsNotInXlsFormSample: csvColsNotInXlsForm.slice(
      0,
      DIAGNOSTIC_SAMPLE_SIZE,
    ),
    nSelectMultipleExpanded,
    facilityMatch: changeSet.match,
    facilityChanges,
    labelResolution: labelResolution.map((t) => ({
      column: t.column,
      resolvedCount: t.resolvedCount,
      unresolvedValues: t.unresolvedValues,
    })),
    facilitiesWithoutAdminTuple: {
      count: withoutAdminTuple.length,
      sample: withoutAdminTuple.slice(0, DIAGNOSTIC_SAMPLE_SIZE),
    },
  };
}

const STAGED_QUESTION_TYPES = new Set<XlsFormQuestion["type"]>([
  "select_one",
  "select_multiple",
  "integer",
  "decimal",
]);

type CsvQuestionMapping = {
  csvHeader: string;
  csvIndex: number;
  question: XlsFormQuestion;
  choices?: XlsFormChoice[];
};

// A header matches its question by the HFA header convention
// (findXlsFormQuestionForHeader). The variable id is the form's spelling.
function matchCsvColumnsToXlsForm(
  headers: string[],
  facilityIdIndex: number,
  xlsForm: ParsedXlsForm,
): {
  csvQuestionMappings: CsvQuestionMapping[];
  csvColsNotInXlsForm: string[];
  xlsFormQuestionsNotInCsv: string[];
} {
  const csvQuestionMappings: CsvQuestionMapping[] = [];
  const csvColsNotInXlsForm: string[] = [];
  const questionIdsInCsv = new Set<string>();
  const stagedHeaderByQuestionId = new Map<string, string>();

  headers.forEach((csvHeader, csvIndex) => {
    const question = findXlsFormQuestionForHeader(xlsForm, csvHeader);
    if (question) questionIdsInCsv.add(question.questionId);
    if (csvIndex === facilityIdIndex) return;
    if (!question) {
      csvColsNotInXlsForm.push(csvHeader);
      return;
    }
    if (!STAGED_QUESTION_TYPES.has(question.type)) return;

    const earlierHeader = stagedHeaderByQuestionId.get(question.questionId);
    if (earlierHeader !== undefined) {
      throw new Error(
        `The CSV columns "${earlierHeader}" and "${csvHeader}" both match the XLSForm question "${question.questionId}". Remove one of them from the CSV and re-upload.`,
      );
    }
    stagedHeaderByQuestionId.set(question.questionId, csvHeader);

    csvQuestionMappings.push({
      csvHeader,
      csvIndex,
      question,
      choices: question.listName
        ? xlsForm.choiceLists.get(question.listName)
        : undefined,
    });
  });

  const xlsFormQuestionsNotInCsv = [...xlsForm.questions.values()]
    .filter((q) =>
      STAGED_QUESTION_TYPES.has(q.type) && !questionIdsInCsv.has(q.questionId)
    )
    .map((q) => q.questionId);

  return { csvQuestionMappings, csvColsNotInXlsForm, xlsFormQuestionsNotInCsv };
}
