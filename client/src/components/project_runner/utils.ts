const _MAX_CONNECTION_ATTEMPTS = 3;
const _BASE_RETRY_DELAY = 1000; // 1 second
const _MAX_RETRY_DELAY = 30000; // 30 seconds

// Available module IDs - should ideally come from configuration or API
const MODULE_IDS = [
  "m001",
  "m002",
  "m003",
  "m004",
  "m005",
  "m006",
  "m007",
  "m008",
];

export function getRetryDelay(attempt: number): number {
  return Math.min(_BASE_RETRY_DELAY * Math.pow(2, attempt), _MAX_RETRY_DELAY);
}

export function createInitialRLogs() {
  const logs: Record<string, { latest: string }> = {};
  MODULE_IDS.forEach((moduleId) => {
    logs[moduleId] = { latest: "" };
  });
  return logs;
}

export function validateTimestamp(
  newTimestamp: string,
  existingTimestamp?: string,
  context: string = "",
): boolean {
  if (!newTimestamp) {
    console.warn(`No timestamp provided${context ? ` for ${context}` : ""}`);
    return false;
  }

  // Check if the new value is a valid ISO string
  const newDate = new Date(newTimestamp);
  if (isNaN(newDate.getTime())) {
    console.warn(
      `Invalid ISO string provided: ${newTimestamp}${context ? ` for ${context}` : ""}`,
    );
    return false;
  }

  // If no existing timestamp, allow the update
  if (!existingTimestamp) {
    return true;
  }

  // Check if existing timestamp is valid
  const existingDate = new Date(existingTimestamp);
  if (isNaN(existingDate.getTime())) {
    console.warn(
      `Existing timestamp is invalid${context ? ` for ${context}` : ""}`,
    );
    return false;
  }

  // Only allow updates with newer timestamps
  if (newDate <= existingDate) {
    console.warn(
      `Timestamp ${newDate <= existingDate ? (newDate.getTime() === existingDate.getTime() ? "is equal" : "is older") : ""}` +
        `${context ? ` for ${context}` : ""}`,
    );
    return false;
  }

  return true;
}

export { _MAX_CONNECTION_ATTEMPTS };
