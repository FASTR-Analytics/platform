import { getDHIS2 } from "../common/base_fetcher.ts";
import type { Dhis2OrgUnitName, Dhis2OrgUnitPath, FetchOptions } from "./types.ts";

// Unvalidated JSON from an external server: every field may be missing or
// null, whatever the DHIS2 docs promise.
type OrgUnitWire = {
  id: string | null | undefined;
  name: string | null | undefined;
  displayName: string | null | undefined;
  path: string | null | undefined;
};

type OrgUnitsResponse = {
  organisationUnits: OrgUnitWire[] | null | undefined;
  pager: { pageCount: number | null | undefined } | null | undefined;
};

const PAGE_DELAY_MS = 100;

function labelOf(ou: OrgUnitWire): string {
  return ou.displayName || ou.name || "";
}

// Every unit at a level in one response, for parent-name resolution. A unit
// with no id cannot be looked up and is dropped.
export async function getOrgUnitNamesAtLevel(
  level: number,
  options: FetchOptions,
): Promise<Dhis2OrgUnitName[]> {
  const params = new URLSearchParams();
  params.set("fields", "id,name,displayName");
  params.set("filter", `level:eq:${level}`);
  params.set("paging", "false");
  const response = await getDHIS2<OrgUnitsResponse>(
    "/api/organisationUnits.json",
    options,
    params,
  );
  return (response.organisationUnits ?? []).flatMap((ou) =>
    ou.id == null ? [] : [{ id: ou.id, name: labelOf(ou) }]
  );
}

export type OrgUnitPathPage = {
  units: Dhis2OrgUnitPath[];
  // Units on the page with no id or no path: they cannot be staged.
  dropped: number;
};

// Pages through every unit at a level with its hierarchy path, one page per
// yield, pausing briefly between pages to spare the DHIS2 server.
export async function* pageOrgUnitPathsAtLevel(
  level: number,
  pageSize: number,
  options: FetchOptions,
): AsyncGenerator<OrgUnitPathPage> {
  for (let page = 1;; page++) {
    const params = new URLSearchParams();
    params.set("fields", "id,name,displayName,path");
    params.set("filter", `level:eq:${level}`);
    params.set("pageSize", String(pageSize));
    params.set("page", String(page));
    params.set("paging", "true");
    const response = await getDHIS2<OrgUnitsResponse>(
      "/api/organisationUnits.json",
      options,
      params,
    );
    const rows = response.organisationUnits ?? [];
    if (rows.length === 0) {
      return;
    }
    const units = rows.flatMap((ou) =>
      ou.id == null || ou.path == null
        ? []
        : [{ id: ou.id, name: labelOf(ou), path: ou.path }]
    );
    yield { units, dropped: rows.length - units.length };
    const pageCount = response.pager?.pageCount;
    if (typeof pageCount !== "number" || page >= pageCount) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
  }
}
