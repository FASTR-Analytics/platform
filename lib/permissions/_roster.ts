import { effectivePermissions } from "./_flags.ts";
import type { ScopeAccess } from "./_scope_access.ts";
import type { OtherUser } from "./_user.ts";

// What every approved connection receives about a user: enough to name them
// in a picker and to say whether a grant reaches them.
export type UserDirectoryEntry = {
  email: string;
  isGlobalAdmin: boolean;
  firstName?: string;
  lastName?: string;
  scopeAccess: ScopeAccess;
};

export type RosterEntry = OtherUser | UserDirectoryEntry;

export function isRosterRow(entry: RosterEntry): entry is OtherUser {
  return "unlimitedAi" in entry;
}

export function directoryEntry(user: OtherUser): UserDirectoryEntry {
  const { email, isGlobalAdmin, firstName, lastName, scopeAccess } = user;
  return { email, isGlobalAdmin, firstName, lastName, scopeAccess };
}

// The roster a connection receives: nothing while its user is absent from
// the table (unapproved), every row for a holder of can_view_users (an admin
// included), and directory rows otherwise, with the viewer's own row whole so
// the client derives its own permissions from it.
export function rosterForViewer(
  users: OtherUser[],
  viewerEmail: string,
): RosterEntry[] {
  const me = users.find((u) => u.email === viewerEmail);
  if (me === undefined) return [];
  if (effectivePermissions(me).can_view_users) return users;
  return users.map((u) => u.email === viewerEmail ? u : directoryEntry(u));
}
