// The HFA indicator verification run's worker: it drains the run (run.ts),
// calling Anthropic directly with the instance's key, outside the copilot
// proxy's token limits and usage log, and reports back through the run row
// and "COMPLETED".

import Anthropic from "@anthropic-ai/sdk";
import { createWorkerReadConnection } from "../../db/mod.ts";
import {
  _ANTHROPIC_API_KEY,
  _ANTHROPIC_API_URL,
} from "../../exposed_env_vars.ts";
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
      // _ANTHROPIC_API_URL is the /v1/messages endpoint; the SDK takes the
      // origin and adds the path itself.
      sdkClient: new Anthropic({
        apiKey: _ANTHROPIC_API_KEY,
        baseURL: new URL(_ANTHROPIC_API_URL).origin,
      }),
      now: Date.now,
    }, payload.runId);
  } finally {
    await mainDb.end();
  }
  self.postMessage("COMPLETED");
}
