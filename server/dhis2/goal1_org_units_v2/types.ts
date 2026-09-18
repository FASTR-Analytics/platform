export type { FetchOptions } from "../common/mod.ts";

// App-side shapes. Every fetcher in this folder reads a private wire type
// (every field possibly missing or null) and returns one of these.

export type Dhis2OrgUnitLevel = {
  level: number;
  name: string;
  displayName: string;
};

export type Dhis2RootOrgUnit = {
  id: string;
  name: string;
  displayName: string;
  level: number;
  childrenCount: number;
};

// A unit's id and its label as DHIS2 shows it: displayName, else name, else
// blank.
export type Dhis2OrgUnitName = {
  id: string;
  name: string;
};

export type Dhis2OrgUnitPath = Dhis2OrgUnitName & {
  path: string;
};

export type OrgUnitMetadata = {
  levels: Array<Dhis2OrgUnitLevel & { count: number }>;
  rootOrgUnits: Dhis2RootOrgUnit[];
  summary: {
    totalOrgUnits: number;
    maxLevel: number;
  };
};
