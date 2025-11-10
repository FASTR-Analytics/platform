import type { Dhis2Credentials } from "lib";

const DHIS2_CREDENTIALS_SESSION_KEY = "dhis2_credentials_session";

export function getDhis2SessionCredentials(): Dhis2Credentials | null {
  try {
    const stored = sessionStorage.getItem(DHIS2_CREDENTIALS_SESSION_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as Dhis2Credentials;

    // Validate that all required fields are present
    if (!parsed.url || !parsed.username || !parsed.password) {
      clearDhis2SessionCredentials();
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn("Failed to parse DHIS2 session credentials:", error);
    clearDhis2SessionCredentials();
    return null;
  }
}

export function setDhis2SessionCredentials(
  credentials: Dhis2Credentials,
): void {
  try {
    sessionStorage.setItem(
      DHIS2_CREDENTIALS_SESSION_KEY,
      JSON.stringify(credentials),
    );
  } catch (error) {
    console.error("Failed to store DHIS2 session credentials:", error);
    throw new Error("Failed to store credentials in session storage");
  }
}

export function clearDhis2SessionCredentials(): void {
  try {
    sessionStorage.removeItem(DHIS2_CREDENTIALS_SESSION_KEY);
  } catch (error) {
    console.warn("Failed to clear DHIS2 session credentials:", error);
  }
}

export function hasDhis2SessionCredentials(): boolean {
  return getDhis2SessionCredentials() !== null;
}
