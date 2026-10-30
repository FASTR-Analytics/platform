import type { Language } from "../translate/types.ts";
import type {
  InstanceCalendar,
  InstanceFiscalYear,
} from "../types/instance.ts";
import { type UserPermissions, userPermissions } from "./_flags.ts";
import { ALL_SCOPES, type ScopeAccess } from "./_scope_access.ts";

// A request's identity once its credential has become an email.
// `thisUserPermissions` are the effective permissions (effectivePermissions).
export type GlobalUser = {
  instanceName: string;
  instanceLanguage: Language;
  instanceCalendar: InstanceCalendar;
  instanceFiscalYear: InstanceFiscalYear;
  openAccess: boolean;
  email: string;
  firstName: string;
  lastName: string;
  // The user's own words, from their profile; null until they say.
  organisation: string | null;
  approved: boolean;
  isGlobalAdmin: boolean;
  thisUserPermissions: UserPermissions;
  unlimitedAi: boolean;
  scopeAccess: ScopeAccess;
};

// A roster row. It carries the STORED permission bits; a reader derives the
// effective ones with effectivePermissions.
export type OtherUser = {
  email: string;
  isGlobalAdmin: boolean;
  firstName?: string;
  lastName?: string;
  organisation?: string;
  unlimitedAi: boolean;
  isContactPerson: boolean;
  scopeAccess: ScopeAccess;
} & UserPermissions;

export function createDevGlobalUser(
  instanceName: string,
  instanceLanguage: Language,
  instanceCalendar: InstanceCalendar,
  instanceFiscalYear: InstanceFiscalYear,
): GlobalUser {
  return {
    instanceName,
    instanceLanguage,
    instanceCalendar,
    instanceFiscalYear,
    openAccess: false,
    email: "dev@offline.local",
    firstName: "Dev",
    lastName: "User",
    organisation: null,
    approved: true,
    isGlobalAdmin: true,
    thisUserPermissions: userPermissions(true),
    unlimitedAi: false,
    scopeAccess: ALL_SCOPES,
  };
}
