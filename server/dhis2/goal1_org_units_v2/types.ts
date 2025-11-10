// Reuse existing types from v1 but only what we need
export type { FetchOptions } from "../common/mod.ts";

export interface DHIS2PagedResponse<T> {
  pager?: {
    page: number;
    pageCount: number;
    total: number;
    pageSize: number;
  };
  organisationUnits?: T[];
  organisationUnitLevels?: T[];
  organisationUnitGroups?: T[];
}

export interface DHIS2ErrorResponse {
  httpStatus: string;
  httpStatusCode: number;
  status: string;
  message: string;
  errorCode?: string;
}

export interface DHIS2OrgUnit {
  id: string;
  name: string;
  displayName?: string;
  shortName?: string;
  code?: string;
  level: number;
  path: string;
  parent?: {
    id: string;
    name: string;
  };
  organisationUnitGroups?: Array<{
    id: string;
    name: string;
  }>;
  coordinates?: string;
  openingDate?: string;
  closedDate?: string;
  comment?: string;
  featureType?: string;
  attributes?: Array<{
    id: string;
    value: string;
  }>;
  children?: DHIS2OrgUnit[];
}

export interface DHIS2OrgUnitLevel {
  id: string;
  name: string;
  displayName: string;
  level: number;
}

// Simplified metadata structure focused on levels only
export interface OrgUnitMetadata {
  levels: Array<{
    level: number;
    name: string;
    displayName: string;
    count: number;
  }>;
  rootOrgUnits: Array<{
    id: string;
    name: string;
    displayName: string;
    level: number;
    childrenCount: number;
  }>;
  summary: {
    totalOrgUnits: number;
    maxLevel: number;
  };
}

// Progress callback for streaming operations
export type ProgressCallback = (
  current: number,
  total: number,
  message?: string
) => void;

// Batch processing callback
export type BatchProcessor<T> = (batch: T[]) => Promise<void>;

// Legacy hierarchy structure (for compatibility with structure cache)
export interface OrgUnitHierarchy {
  levels: Map<number, DHIS2OrgUnitLevel>;
  orgUnits: Map<string, DHIS2OrgUnit>;
  rootUnits: DHIS2OrgUnit[];
  facilityCount: number;
  maxLevel: number;
  validationErrors: string[];
}
