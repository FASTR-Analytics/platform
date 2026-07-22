import { clerk } from "~/components/LoggedInWrapper";
import type { StorageAdapter } from "@njwse/roadtrip";

type OnboardingRecord = Record<string, unknown>;

function currentOnboarding(): OnboardingRecord {
  const onboarding = clerk.user?.unsafeMetadata?.onboarding;
  return onboarding && typeof onboarding === "object"
    ? (onboarding as OnboardingRecord)
    : {};
}

// Writes are queued so concurrent flag updates can't clobber each other via
// the unsafeMetadata spread-merge; the merge re-reads state at write time.
let writeQueue: Promise<void> = Promise.resolve();

export const clerkOnboardingStorage: StorageAdapter = {
  get(key) {
    return currentOnboarding()[key];
  },
  set(key, value) {
    writeQueue = writeQueue
      .then(async () => {
        const user = clerk.user;
        if (!user) return;
        await user.update({
          unsafeMetadata: {
            ...user.unsafeMetadata,
            onboarding: { ...currentOnboarding(), [key]: value },
          },
        });
      })
      .catch(() => {});
    return writeQueue;
  },
};
