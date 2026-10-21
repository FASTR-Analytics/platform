import {
  closeAllConnections,
  getPgConnectionFromCacheOrNew,
} from "./server/db/mod.ts";
import {
  applyDhis2IdFix,
  type Dhis2IdFixAction,
  type Dhis2IdFixPlan,
  diffDhis2IdFixPlans,
  gatherDhis2IdFixFacts,
  planDhis2IdFix,
  queueDhis2IdFixBackfill,
  readDhis2IdFixPlanFile,
  waitForDhis2IdFixBackfill,
} from "./server/dhis2_id_fix/mod.ts";

// Repairs, in place, the DHIS2 element indicators whose DHIS2 id DHIS2 has
// as a formula, as nothing, or as an element it cannot serve as a monthly
// count, folds an element written with its default combo onto the bare
// element, and deletes the error ledger rows without records under every
// indicator that is Uploaded once the repair is done. Runs inside the
// instance's app container, which holds the database connection and the
// credentials key; locally, with `--env-file`. Nothing is passed as an
// argument.
//
//   deno run -A fix_dhis2_ids.ts plan > plan.json       the dry run, read it
//   deno run -A fix_dhis2_ids.ts apply < plan.json      exit 2 if it has drifted
//   deno run -A fix_dhis2_ids.ts backfill < plan.json   import what it emptied

const USAGE = "Usage: deno run -A fix_dhis2_ids.ts plan | apply | backfill";

function describeAction(action: Dhis2IdFixAction): string {
  const rows = action.rows.count === 0
    ? "no rows"
    : `${action.rows.count} rows ${action.rows.firstPeriodId} to ${action.rows.lastPeriodId}`;
  switch (action.outcome) {
    case "retarget":
      return `${action.indicatorId}: retarget ${action.dataId} -> ${action.newDataId} (${action.dhis2Label}), ${rows} move`;
    case "to_sum":
      return `${action.indicatorId}: to_sum over ${
        action.members.join(" + ")
      }, ${rows} deleted`;
    case "to_calculated":
      return `${action.indicatorId}: to_calculated ${action.expression} as ${action.formatAs}, ${rows} deleted`;
    case "to_uploaded":
      return `${action.indicatorId}: to_uploaded (${action.reason}), ${rows} kept`;
    case "duplicate":
      return `${action.indicatorId}: duplicate of ${action.holder} (${action.holderDataId}), references move to it${
        action.includeHolderInAnalysis ? " and it joins the analysis" : ""
      }, ${rows} deleted`;
  }
}

function summarise(plan: Dhis2IdFixPlan): string[] {
  const staleRows = plan.staleLedgerRows.reduce((n, s) => n + s.count, 0);
  return [
    `${plan.dhis2Url}: ${plan.elementsChecked} DHIS2 elements checked, ${plan.elementsHealthy} healthy, ${plan.actions.length} to repair, ${staleRows} stale ledger rows to delete`,
    ...plan.createdElements.map((c) =>
      `create ${c.indicatorId} (${c.label}) for ${c.dataId}`
    ),
    ...plan.actions.map(describeAction),
    ...plan.sumRewrites.map((s) =>
      `rewrite Sum ${s.sumId} to ${s.members.join(" + ")}`
    ),
    ...plan.staleLedgerRows.map((s) =>
      `delete ${s.count} stale ledger rows of ${s.indicatorId} (${s.dataId})`
    ),
  ];
}

async function readStdin(): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of Deno.stdin.readable) {
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

const command = Deno.args[0];
if (command !== "plan" && command !== "apply" && command !== "backfill") {
  console.error(USAGE);
  Deno.exit(1);
}

const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
let exitCode = 0;
try {
  if (command === "backfill") {
    const { runId, selection } = await queueDhis2IdFixBackfill(
      mainDb,
      readDhis2IdFixPlanFile(await readStdin()),
    );
    console.log(
      `Import run ${runId} queued over ${
        selection.indicatorIds.join(", ")
      }, ${selection.startPeriod} to ${selection.endPeriod}; the server starts it within a minute, and this waits for it to end`,
    );
    const run = await waitForDhis2IdFixBackfill(mainDb, runId);
    console.log(
      `Import run ${run.id}: ${run.status}, ${run.succeededPairs} pairs succeeded, ${run.failedPairs} failed${
        run.error === undefined ? "" : `: ${run.error}`
      }`,
    );
    exitCode = run.status === "complete" ? 0 : 1;
  } else if (command === "plan") {
    const plan = planDhis2IdFix(
      await gatherDhis2IdFixFacts(mainDb),
      new Date().toISOString(),
    );
    for (const line of summarise(plan)) console.error(line);
    console.log(JSON.stringify(plan, null, 2));
  } else {
    const given = readDhis2IdFixPlanFile(await readStdin());
    const recomputed = planDhis2IdFix(
      await gatherDhis2IdFixFacts(mainDb),
      given.plannedAt,
    );
    const differences = diffDhis2IdFixPlans(given, recomputed);
    if (differences.length > 0) {
      console.error("The plan has drifted from live state; nothing applied:");
      for (const line of differences) console.error(`  ${line}`);
      exitCode = 2;
    } else {
      const result = await applyDhis2IdFix(mainDb, recomputed);
      for (const a of result.actions) {
        console.log(
          `${a.indicatorId}: ${a.outcome}, ${a.rowsMoved} rows moved, ${a.rowsDeleted} rows deleted`,
        );
      }
      for (const sumId of result.sumsRewritten) {
        console.log(`Sum ${sumId}: members rewritten`);
      }
      console.log(`${result.staleLedgerRowsDeleted} stale ledger rows deleted`);
      console.log(
        result.versionId === null
          ? "No rows deleted, no version minted"
          : `Minted dataset version ${result.versionId}`,
      );
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  exitCode = 1;
} finally {
  await closeAllConnections();
}
Deno.exit(exitCode);
