import { createEffect, createSignal } from "solid-js";
import { showAi } from "~/state/t4_ui";
import { clerkOnboardingStorage } from "./storage";

// The AI button pulses until the user has opened the AI panel once. The
// flag rides the tours' own Clerk record, so it follows the user across
// devices, and is written on the first open, wherever that happens (the AI
// tour's click included). Called once from the instance shell, after sign-in,
// when the Clerk user is loaded.
const AI_OPENED_KEY = "ai:opened";

export function setupAiNudge(): { pulse: () => boolean } {
  const [opened, setOpened] = createSignal(
    clerkOnboardingStorage.get(AI_OPENED_KEY) === true,
  );
  createEffect(() => {
    const open = showAi();
    const done = opened();
    if (!open || done) return;
    setOpened(true);
    void clerkOnboardingStorage.set(AI_OPENED_KEY, true);
  });
  return { pulse: () => !opened() };
}
