import type { TourManagerEvent } from "@njwse/roadtrip";
import { serverActions } from "~/server_actions";

// Every tour manager reports here (roadtrip's onEvent). Only start / finish /
// abort are sent — the server records one user_logs row per event under
// "tour_<event>:<tourId>", so per-tour counts (and, for aborts, the step the
// user bailed at and whether that was a skip or a missing target) survive the
// weekly rollup. Per-step events are dropped: an abort already says how far
// the run got. Fire-and-forget — telemetry must never surface in the UI.
export function reportTourEvent(e: TourManagerEvent): void {
  if (e.type === "step") return;
  const body = {
    tourId: e.tourId,
    event: e.type,
    page: e.page,
    trigger: e.trigger,
    ...(e.type === "abort"
      ? { stepIndex: e.stepIndex, stepId: e.stepId, reason: e.reason }
      : {}),
  };
  serverActions.recordTourEvent(body).catch(() => {});
}
