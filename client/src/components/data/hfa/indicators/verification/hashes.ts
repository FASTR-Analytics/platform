import {
  buildHfaVerificationInstructionBlock,
  buildHfaVerificationMessages,
  type HfaIndicatorsForAIInput,
  type HfaVerificationFinding,
  hfaVerificationInputHash,
  type HfaVerificationRows,
} from "lib";
import { type Accessor, createEffect, createSignal } from "solid-js";
import { instanceState } from "~/state/instance/t1_store";

const NO_DISMISSED = new Map<string, HfaVerificationFinding[]>();

// Every indicator's current input hash, from the state the manager holds,
// which has no display rows and needs none: they are not hashed. A digest is
// asynchronous, so an effect writes the map and a pass that a newer read
// input supersedes is dropped.
export function createHfaVerificationHashes(
  read: Accessor<HfaIndicatorsForAIInput | undefined>,
): Accessor<Map<string, string> | undefined> {
  const [hashes, setHashes] = createSignal<Map<string, string>>();
  let runId = 0;
  createEffect(async () => {
    const r = read();
    const language = instanceState.instanceLanguage;
    if (r === undefined) return;
    const thisRun = ++runId;
    const instructionBlock = buildHfaVerificationInstructionBlock(language);
    const entries = await Promise.all(
      [...buildHfaVerificationMessages(r, NO_DISMISSED)].map(
        async ([id, { hashedMessage }]) =>
          [
            id,
            await hfaVerificationInputHash(instructionBlock, hashedMessage),
          ] as const,
      ),
    );
    if (thisRun !== runId) return;
    setHashes(new Map(entries));
  });
  return hashes;
}

export type HfaVerificationStatus = "not_verified" | "changed" | "verified";

// `open` holds the findings neither dismissed nor of a switched-off rule.
export type HfaIndicatorVerificationState = {
  status: HfaVerificationStatus;
  open: HfaVerificationFinding[];
};

// `queue` is what Verify checks: every indicator not verified or changed, in
// the manager's order.
export type HfaVerificationState = {
  byIndicator: Map<string, HfaIndicatorVerificationState>;
  queue: string[];
};

export function hfaVerificationState(
  hashes: Map<string, string>,
  rows: HfaVerificationRows,
): HfaVerificationState {
  const verifiedHashes = new Map(
    rows.verifications.map((v) => [v.indicatorId, v.inputHash]),
  );
  const rulesOff = new Set<string>(rows.rulesOff);
  const open = new Map<string, HfaVerificationFinding[]>();
  for (const f of rows.findings) {
    if (f.dismissedAt !== null || rulesOff.has(f.rule)) continue;
    const list = open.get(f.indicatorId) ?? [];
    list.push(f);
    open.set(f.indicatorId, list);
  }
  const byIndicator = new Map<string, HfaIndicatorVerificationState>();
  const queue: string[] = [];
  for (const [indicatorId, hash] of hashes) {
    const verifiedHash = verifiedHashes.get(indicatorId);
    const status: HfaVerificationStatus = verifiedHash === undefined
      ? "not_verified"
      : verifiedHash === hash
      ? "verified"
      : "changed";
    byIndicator.set(indicatorId, {
      status,
      open: open.get(indicatorId) ?? [],
    });
    if (status !== "verified") queue.push(indicatorId);
  }
  return { byIndicator, queue };
}
