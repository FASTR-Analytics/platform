import { createStore } from "solid-js/store";
import type { ADTFigure } from "panther";

// Store interpretations by a key composed of projectId and presentationObjectId
type InterpretationKey = string;

type InterpretationData = {
  interpretation: string;
  additionalInstructions: string;
  hasBeenTriggered: boolean;
  lastInterpretedInputs: ADTFigure | null;
  timestamp: number;
};

// Create a store to hold all interpretations
const [interpretationsStore, setInterpretationsStore] = createStore<
  Record<InterpretationKey, InterpretationData>
>({});

// Helper function to create a key
export function createInterpretationKey(
  projectId: string,
  presentationObjectId: string,
): InterpretationKey {
  return `${projectId}:${presentationObjectId}`;
}

// Get or initialize interpretation data
export function getInterpretationData(
  key: InterpretationKey,
): InterpretationData {
  return (
    interpretationsStore[key] || {
      interpretation: "",
      additionalInstructions: "",
      hasBeenTriggered: false,
      lastInterpretedInputs: null,
      timestamp: 0,
    }
  );
}

// Update interpretation data
export function updateInterpretationData(
  key: InterpretationKey,
  updates: Partial<InterpretationData>,
) {
  const current = getInterpretationData(key);
  setInterpretationsStore(key, {
    ...current,
    ...updates,
    timestamp: Date.now(),
  });
}

// Clear interpretation data for a specific key
export function clearInterpretationData(key: InterpretationKey) {
  setInterpretationsStore(key, undefined!);
}

// Clear all interpretation data
export function clearAllInterpretations() {
  setInterpretationsStore({});
}

// Export the store for debugging purposes
export { interpretationsStore };

// Clean up old interpretations (older than 24 hours)
export function cleanupOldInterpretations() {
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;

  Object.keys(interpretationsStore).forEach((key) => {
    const data = interpretationsStore[key];
    if (data && now - data.timestamp > twentyFourHours) {
      clearInterpretationData(key);
    }
  });
}

// Optional: Set up automatic cleanup every hour
if (typeof window !== "undefined") {
  setInterval(cleanupOldInterpretations, 60 * 60 * 1000);
}
