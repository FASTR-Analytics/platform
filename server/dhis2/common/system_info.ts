import { type FetchOptions, getDHIS2 } from "./base_fetcher.ts";

// Unvalidated JSON from an external server: the field may be missing or
// null.
type SystemInfoResponse = { version: string | null | undefined };

// The version DHIS2 reports for itself ("2.38.4", "2.40.1",
// "2.44-SNAPSHOT"); undefined when the field is missing.
export async function getDhis2Version(
  options: FetchOptions,
): Promise<string | undefined> {
  const info = await getDHIS2<SystemInfoResponse>(
    "/api/system/info.json",
    options,
  );
  return info.version ?? undefined;
}

// The release number DHIS2 names its lines by: "2.38.4" is release 38. The
// field keeps the "2." prefix on the lines marketed as v40 and later; a
// value without it ("40.1.0") is read as the release itself.
export function parseDhis2Release(
  version: string | undefined,
): number | undefined {
  const match = version?.match(/^(\d+)\.(\d+)/);
  if (!match) {
    return undefined;
  }
  const major = Number(match[1]);
  return major === 2 ? Number(match[2]) : major;
}
