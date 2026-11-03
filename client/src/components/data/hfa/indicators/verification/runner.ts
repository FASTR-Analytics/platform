import { APIError } from "@anthropic-ai/sdk";
import {
  buildHfaVerificationBlocks,
  buildHfaVerificationMessages,
  type HfaVerificationFinding,
  hfaVerificationInputHash,
  hfaVerificationOutputSchema,
  type HfaVerificationResult,
  t3,
} from "lib";
import { callAIStructured } from "panther";
import { createSignal } from "solid-js";
import { createAiProxyClient } from "~/components/_shared/mod.ts";
import { serverActions } from "~/server_actions";
import { getSnapshotInstanceState } from "~/state/instance/t1_store";
import { getHfaVerificationFromCacheOrFetch } from "~/state/instance/t2_indicators";
import { loadReadInput } from "../_shared/mod.ts";

// One run at a time for the browser tab, held at module level so it outlives
// the manager, the editor and the tab switches between them; closing the tab
// ends it, and the next run's queue is whatever is still unverified then.

const IN_FLIGHT = 4;
const SAVE_BATCH = 10;

export type HfaVerificationProgress = {
  done: number;
  queued: number;
  current: string | undefined;
  pending: ReadonlySet<string>;
};

// An indicator the model gave no usable answer for: `stopReason` is the
// response's, `refusal` or `max_tokens`, or another when the answer failed
// the schema.
export type HfaVerificationNotChecked = {
  indicatorId: string;
  stopReason: string | null;
};

// Why a structured answer was null, for a verification or a fix.
export function noAnswerReason(stopReason: string | null): string {
  switch (stopReason) {
    case "refusal":
      return t3({
        en: "the model declined",
        fr: "le modèle a refusé",
        pt: "o modelo recusou",
      });
    case "max_tokens":
      return t3({
        en: "the answer was cut off",
        fr: "la réponse a été tronquée",
        pt: "a resposta foi cortada",
      });
    default:
      return t3({
        en: "the answer was not in the expected form",
        fr: "la réponse n'avait pas la forme attendue",
        pt: "a resposta não tinha a forma esperada",
      });
  }
}

// `progress` is undefined while no run is in progress; `notChecked` and
// `stopError` are the current or last run's until the next starts.
export type HfaVerificationRunState = {
  progress: HfaVerificationProgress | undefined;
  notChecked: HfaVerificationNotChecked[];
  stopError: string | undefined;
};

const [hfaVerificationRun, setRun] = createSignal<HfaVerificationRunState>({
  progress: undefined,
  notChecked: [],
  stopError: undefined,
});
let controller: AbortController | undefined;

export { hfaVerificationRun };

function setProgress(
  update: (p: HfaVerificationProgress) => HfaVerificationProgress,
): void {
  setRun((r) =>
    r.progress === undefined ? r : { ...r, progress: update(r.progress) }
  );
}

export function startRun(queue: string[]): void {
  if (controller !== undefined || queue.length === 0) return;
  const runController = new AbortController();
  controller = runController;
  setRun({
    progress: {
      done: 0,
      queued: queue.length,
      current: undefined,
      pending: new Set(queue),
    },
    notChecked: [],
    stopError: undefined,
  });
  void run(queue, runController).finally(() => {
    controller = undefined;
    setRun((r) => ({ ...r, progress: undefined }));
  });
}

export function stopRun(): void {
  controller?.abort();
}

// The two system blocks of every verification call, which the fix call sends
// unchanged, so a fix drafted over the same state within the prompt cache's
// lifetime reads the context block a run wrote.
export function hfaVerificationSystem(
  blocks: { instructionBlock: string; contextBlock: string },
) {
  return () => [
    { type: "text" as const, text: blocks.instructionBlock },
    {
      type: "text" as const,
      text: blocks.contextBlock,
      cache_control: { type: "ephemeral" as const },
    },
  ];
}

// An API error's message is its status and the response body as JSON; the
// body's own message is the readable part (the proxy's quota rejection and
// its reset time).
export function callErrorMessage(e: unknown): string {
  if (e instanceof APIError) {
    const body = e.error as { error?: { message?: unknown } } | undefined;
    if (typeof body?.error?.message === "string") return body.error.message;
  }
  return e instanceof Error ? e.message : String(e);
}

async function run(
  queue: string[],
  runController: AbortController,
): Promise<void> {
  const signal = runController.signal;
  const batch: HfaVerificationResult[] = [];
  // The first failure stops the run; the aborts it causes are not failures.
  const stopWith = (e: unknown) => {
    if (signal.aborted) return;
    setRun((r) => ({ ...r, stopError: callErrorMessage(e) }));
    runController.abort();
  };
  const flush = async () => {
    if (batch.length === 0) return;
    const res = await serverActions.saveHfaIndicatorVerifications({
      results: batch.splice(0),
    });
    if (!res.success) throw new Error(res.err);
  };

  try {
    const [read, rows] = await Promise.all([
      loadReadInput(true),
      getHfaVerificationFromCacheOrFetch(
        getSnapshotInstanceState().hfaVerificationVersion,
      ),
    ]);
    if (!rows.success) throw new Error(rows.err);
    const dismissedByIndicator = new Map<string, HfaVerificationFinding[]>();
    for (const f of rows.data.findings) {
      if (f.dismissedAt === null) continue;
      const list = dismissedByIndicator.get(f.indicatorId) ?? [];
      list.push(f);
      dismissedByIndicator.set(f.indicatorId, list);
    }
    const blocks = buildHfaVerificationBlocks(
      read,
      getSnapshotInstanceState().instanceLanguage,
    );
    const messages = buildHfaVerificationMessages(read, dismissedByIndicator);
    const ids = queue.filter((id) => messages.has(id));
    const hashes = new Map(
      await Promise.all(
        ids.map(async (id) =>
          [
            id,
            await hfaVerificationInputHash(
              blocks.instructionBlock,
              messages.get(id)!.hashedMessage,
            ),
          ] as const
        ),
      ),
    );
    setProgress((p) => ({ ...p, queued: ids.length, pending: new Set(ids) }));
    const sdkClient = createAiProxyClient();
    const system = hfaVerificationSystem(blocks);

    const check = async (indicatorId: string) => {
      setProgress((p) => ({ ...p, current: indicatorId }));
      const res = await callAIStructured(
        { sdkClient, system },
        [{ role: "user", content: messages.get(indicatorId)!.message }],
        hfaVerificationOutputSchema,
        { signal },
      );
      if (res.data === null) {
        setRun((r) => ({
          ...r,
          notChecked: [
            ...r.notChecked,
            { indicatorId, stopReason: res.stopReason },
          ],
        }));
      } else {
        batch.push({
          indicatorId,
          inputHash: hashes.get(indicatorId)!,
          model: res.model,
          findings: res.data.findings,
        });
      }
      setProgress((p) => ({
        ...p,
        done: p.done + 1,
        pending: new Set([...p.pending].filter((id) => id !== indicatorId)),
      }));
      if (batch.length >= SAVE_BATCH) await flush();
    };

    let next = 0;
    const step = async () => {
      try {
        await check(ids[next++]);
      } catch (e) {
        stopWith(e);
      }
    };
    // The first call writes the context block to the prompt cache alone, so
    // every later call reads it instead of writing it again.
    if (ids.length > 0) await step();
    await Promise.all(
      Array.from({ length: IN_FLIGHT }, async () => {
        while (next < ids.length && !signal.aborted) await step();
      }),
    );
  } catch (e) {
    stopWith(e);
  }

  try {
    await flush();
  } catch (e) {
    setRun((r) => ({ ...r, stopError: r.stopError ?? callErrorMessage(e) }));
  }
}
