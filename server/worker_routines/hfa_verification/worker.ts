// The HFA indicator verification run's worker: it drains the run (run.ts),
// each call made through the proxy's governance as the user who queued the
// indicator, and reports back through the run row and "COMPLETED".

import {
  createWorkerReadConnection,
  getHfaVerificationQueuerUnlimitedAi,
} from "../../db/mod.ts";
import { createGovernedAnthropicClient } from "../../routes/anthropic_messages_proxy.ts";
import type { HfaVerificationWorkerPayload } from "./instantiate_worker.ts";
import { runHfaVerification } from "./run.ts";

(self as unknown as Worker).onmessage = (e) => {
  run(e.data).catch((error) => {
    console.error("Worker error:", error);
    // Surfaces to the host's error listener, which terminates this worker.
    self.reportError(error);
  });
};

(self as unknown as Worker).postMessage("READY");

let alreadyRunning = false;

async function run(payload: HfaVerificationWorkerPayload) {
  if (alreadyRunning) {
    self.close();
    return;
  }
  alreadyRunning = true;

  const mainDb = createWorkerReadConnection("main");
  try {
    await runHfaVerification({
      mainDb,
      clientFor: async (queuedBy) =>
        createGovernedAnthropicClient({
          userEmail: queuedBy,
          unlimitedAi: await getHfaVerificationQueuerUnlimitedAi(
            mainDb,
            queuedBy,
          ),
          mainDb,
        }),
      now: Date.now,
    }, payload.runId);
  } finally {
    await mainDb.end();
  }
  self.postMessage("COMPLETED");
}
