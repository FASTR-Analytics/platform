import type Anthropic from "@anthropic-ai/sdk";
import { callAIStructured } from "@timroberton/panther";
import type { Sql } from "postgres";
import {
  type APIResponseWithData,
  buildHfaVerificationBlocks,
  buildHfaVerificationMessages,
  type HfaIndicatorsForAIInput,
  hfaIndicatorsStatus,
  type HfaVerificationFinding,
  hfaVerificationInputHash,
  hfaVerificationOutputSchema,
  hfaVerificationSystem,
  modelCallErrorMessage,
  throwIfErrWithData,
} from "lib";
import {
  claimHfaVerificationQueueRow,
  endHfaVerificationRun,
  getAllHfaIndicatorCode,
  getAllHfaIndicatorVariantCode,
  getDatasetHfaItemsForDisplay,
  getHfaDictionaryForValidation,
  getHfaIndicatorCategories,
  getHfaIndicators,
  getHfaIndicatorServiceCategories,
  getHfaIndicatorSubCategories,
  getHfaIndicatorsVersion,
  getHfaIndicatorVariantGroups,
  getHfaIndicatorVariantItems,
  getHfaVerification,
  getHfaVerificationRunStatus,
  getInstanceIndicatorsSummary,
  type HfaVerificationClaim,
  saveHfaVerificationAnswer,
} from "../../db/mod.ts";
import { _INSTANCE_LANGUAGE } from "../../exposed_env_vars.ts";
import { notifyInstanceIndicatorsUpdated } from "../../task_management/notify_instance_updated.ts";

const IN_FLIGHT = 4;
const NOTIFY_INTERVAL_MS = 5000;

export type HfaVerificationRunDeps = {
  mainDb: Sql;
  // The SDK client every call for an indicator is made through, built for
  // the user who queued it.
  clientFor: (queuedBy: string) => Promise<Anthropic>;
  now: () => number;
};

function unwrap<T>(res: APIResponseWithData<T>): T {
  throwIfErrWithData(res);
  return res.data;
}

// The HFA state a run checks, from the DB reads behind the routes the browser
// reads it from, with the dataset's display rows.
export async function readHfaVerificationInput(
  mainDb: Sql,
): Promise<HfaIndicatorsForAIInput> {
  const [
    indicators,
    categories,
    subCategories,
    serviceCategories,
    variantGroups,
    variantItems,
    code,
    variantCode,
    dictionary,
    display,
  ] = await Promise.all([
    getHfaIndicators(mainDb).then(unwrap),
    getHfaIndicatorCategories(mainDb).then(unwrap),
    getHfaIndicatorSubCategories(mainDb).then(unwrap),
    getHfaIndicatorServiceCategories(mainDb).then(unwrap),
    getHfaIndicatorVariantGroups(mainDb).then(unwrap),
    getHfaIndicatorVariantItems(mainDb).then(unwrap),
    getAllHfaIndicatorCode(mainDb),
    getAllHfaIndicatorVariantCode(mainDb),
    getHfaDictionaryForValidation(mainDb).then(unwrap),
    getDatasetHfaItemsForDisplay(mainDb).then(unwrap),
  ]);
  return {
    indicators,
    taxonomy: {
      categories,
      subCategories,
      serviceCategories,
      variantGroups,
      variantItems,
    },
    code,
    variantCode,
    dictionary,
    displayRows: display.rows,
    status: hfaIndicatorsStatus({
      indicators,
      code,
      variantCode,
      variantItems,
      dictionary,
    }),
  };
}

type Snapshot = {
  stamp: string;
  instructionBlock: string;
  system: ReturnType<typeof hfaVerificationSystem>;
  messages: Map<string, { message: string; hashedMessage: string }>;
};

// The stamp is read before the state, so an edit landing between the two
// leaves the snapshot newer than its stamp and is read again, never missed.
async function readSnapshot(mainDb: Sql): Promise<Snapshot> {
  const stamp = await getHfaIndicatorsVersion(mainDb);
  const [read, rows] = await Promise.all([
    readHfaVerificationInput(mainDb),
    getHfaVerification(mainDb).then(unwrap),
  ]);
  const dismissedByIndicator = new Map<string, HfaVerificationFinding[]>();
  for (const f of rows.findings) {
    if (f.dismissedAt === null) continue;
    const list = dismissedByIndicator.get(f.indicatorId) ?? [];
    list.push(f);
    dismissedByIndicator.set(f.indicatorId, list);
  }
  const blocks = buildHfaVerificationBlocks(read, _INSTANCE_LANGUAGE);
  return {
    stamp,
    instructionBlock: blocks.instructionBlock,
    system: hfaVerificationSystem(blocks),
    messages: buildHfaVerificationMessages(read, dismissedByIndicator),
  };
}

// Drains the run's queue until it is empty, the run is stopping, or a call,
// a read or a save fails. Before each claim it reads the run's status, and
// reads the snapshot again when the indicators' stamp has moved. The first
// call after every snapshot read goes alone, so its write of the context
// block to the prompt cache lands once, then four are in flight. Nothing is
// aborted: on a stop or a failure the calls in flight answer and save, then
// the run ends, in error with the first failure's message.
export async function runHfaVerification(
  deps: HfaVerificationRunDeps,
  runId: string,
): Promise<void> {
  const { mainDb, now } = deps;
  const clients = new Map<string, Promise<Anthropic>>();
  const clientFor = (queuedBy: string) => {
    const client = clients.get(queuedBy) ?? deps.clientFor(queuedBy);
    clients.set(queuedBy, client);
    return client;
  };

  let lastNotify = -Infinity;
  let trailing: ReturnType<typeof setTimeout> | undefined;
  const notify = async () => {
    clearTimeout(trailing);
    trailing = undefined;
    lastNotify = now();
    try {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(mainDb),
      );
    } catch (e) {
      console.error("HFA verification notify failed:", e);
    }
  };
  // An answer inside the interval is broadcast when the interval ends, not
  // left for the next answer, which can be a whole call away.
  const notifySoon = async () => {
    const wait = lastNotify + NOTIFY_INTERVAL_MS - now();
    if (wait <= 0) await notify();
    else trailing ??= setTimeout(notify, wait);
  };

  const check = async (
    claim: HfaVerificationClaim,
    snapshot: Snapshot,
    sent: { message: string; hashedMessage: string },
  ) => {
    const res = await callAIStructured(
      { sdkClient: await clientFor(claim.queuedBy), system: snapshot.system },
      [{ role: "user", content: sent.message }],
      hfaVerificationOutputSchema,
    );
    await saveHfaVerificationAnswer(
      mainDb,
      runId,
      claim,
      res.data === null
        ? {
          notChecked: {
            indicatorId: claim.indicatorId,
            stopReason: res.stopReason,
          },
        }
        : {
          result: {
            indicatorId: claim.indicatorId,
            inputHash: await hfaVerificationInputHash(
              snapshot.instructionBlock,
              sent.hashedMessage,
            ),
            model: res.model,
            findings: res.data.findings,
          },
        },
    );
    await notifySoon();
  };

  let firstError: unknown;
  const inFlight = new Set<Promise<void>>();
  const launch = (
    claim: HfaVerificationClaim,
    snapshot: Snapshot,
    sent: { message: string; hashedMessage: string },
  ) => {
    const call: Promise<void> = check(claim, snapshot, sent)
      .catch((e) => {
        firstError ??= e;
      })
      .finally(() => inFlight.delete(call));
    inFlight.add(call);
    return call;
  };

  let snapshot: Snapshot | undefined;
  let alone = true;
  const readAgain = async () => {
    await Promise.all(inFlight);
    snapshot = await readSnapshot(mainDb);
    alone = true;
    return snapshot;
  };

  try {
    while (firstError === undefined) {
      if (inFlight.size >= IN_FLIGHT) {
        await Promise.race(inFlight);
        continue;
      }
      if (await getHfaVerificationRunStatus(mainDb, runId) !== "running") {
        break;
      }
      const stamp = await getHfaIndicatorsVersion(mainDb);
      const current = snapshot !== undefined && snapshot.stamp === stamp
        ? snapshot
        : await readAgain();
      if (firstError !== undefined) break;
      const claim = await claimHfaVerificationQueueRow(mainDb);
      if (claim === undefined) {
        if (inFlight.size > 0) {
          await Promise.race(inFlight);
          continue;
        }
        if (await endHfaVerificationRun(mainDb, runId, undefined)) {
          await notify();
          return;
        }
        continue;
      }
      // An indicator added after the snapshot's stamp was read; one missing
      // from a fresh read was deleted, and its queue row went with it.
      const fresh = current.messages.has(claim.indicatorId)
        ? current
        : await readAgain();
      if (firstError !== undefined) break;
      const sent = fresh.messages.get(claim.indicatorId);
      if (sent === undefined) continue;
      const call = launch(claim, fresh, sent);
      if (alone) {
        await call;
        alone = false;
      }
    }
  } catch (e) {
    firstError ??= e;
  }

  await Promise.all(inFlight);
  await endHfaVerificationRun(
    mainDb,
    runId,
    firstError === undefined ? undefined : modelCallErrorMessage(firstError),
  );
  await notify();
}
