import type { Sql } from "postgres";
import { getResultsObjectTableName } from "../server/db/utils.ts";
import type { Fixture } from "./fixtures.ts";

export async function seedInstance(mainDb: Sql, fx: Fixture): Promise<void> {
  await mainDb`
    INSERT INTO instance_config (config_key, config_json_value)
    VALUES ('facility_columns', ${JSON.stringify(fx.facilityColumns)})
    ON CONFLICT (config_key)
    DO UPDATE SET config_json_value = EXCLUDED.config_json_value
  `;
}

export async function seedProject(projectDb: Sql, fx: Fixture): Promise<void> {
  await projectDb`
    INSERT INTO modules (id, module_definition, config_selections, dirty, last_run_at)
    VALUES (
      ${fx.moduleId},
      ${JSON.stringify(fx.moduleDefinition)},
      '{}',
      'clean',
      '2026-01-01T00:00:00.000Z'
    )
  `;

  await projectDb`
    INSERT INTO results_objects (id, module_id, column_definitions)
    VALUES (
      ${fx.resultsObjectId},
      ${fx.moduleId},
      ${JSON.stringify(fx.roColumns.map((c) => ({ colName: c.name, colType: c.type })))}
    )
  `;

  if (fx.metric) {
    const m = fx.metric;
    await projectDb`
      INSERT INTO metrics (
        id, module_id, label, value_func, format_as, value_props,
        required_disaggregation_options, results_object_id
      ) VALUES (
        ${m.id}, ${fx.moduleId}, ${m.label}, ${m.value_func}, ${m.format_as},
        ${JSON.stringify(m.value_props)},
        ${JSON.stringify(m.required_disaggregation_options)},
        ${fx.resultsObjectId}
      )
    `;
  }

  if (fx.indicators.length > 0) {
    await projectDb`INSERT INTO indicators ${projectDb(fx.indicators)}`;
  }

  const snap = fx.hfaSnapshots;
  if (snap) {
    await projectDb`
      INSERT INTO hfa_indicator_categories_snapshot ${projectDb(snap.categories)}
    `;
    await projectDb`
      INSERT INTO hfa_indicator_sub_categories_snapshot ${projectDb(snap.subCategories)}
    `;
    await projectDb`
      INSERT INTO hfa_indicator_service_categories_snapshot ${projectDb(snap.serviceCategories)}
    `;
    await projectDb`
      INSERT INTO hfa_indicators_snapshot ${projectDb(snap.indicators)}
    `;
  }

  const facilitiesTable =
    fx.family === "hfa" ? "facilities_hfa" : "facilities_hmis";
  if (fx.facilities.length > 0) {
    const cols = Object.keys(fx.facilities[0]);
    await projectDb`
      INSERT INTO ${projectDb(facilitiesTable)} ${projectDb(fx.facilities, ...cols)}
    `;
  }

  // ro_* tables are dynamic in production (built by run_module from CSV
  // headers), so the fixture declares its own columns WITH TYPES. The types are
  // load-bearing: shouldFoldBlank gates on the column actually being TEXT.
  const tableName = getResultsObjectTableName(fx.resultsObjectId);
  const colDdl = fx.roColumns.map((c) => `"${c.name}" ${c.type}`).join(", ");
  await projectDb.unsafe(`CREATE TABLE ${tableName} (${colDdl})`);

  if (fx.roRows.length > 0) {
    const cols = fx.roColumns.map((c) => c.name);
    const normalised = fx.roRows.map((r) =>
      Object.fromEntries(cols.map((c) => [c, r[c] ?? null]))
    );
    await projectDb`
      INSERT INTO ${projectDb(tableName)} ${projectDb(normalised, ...cols)}
    `;
  }
}
