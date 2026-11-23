import type { RosterEntry, Team } from "lib";
import { instanceState } from "./t1_store";

// The client's reads of teams: the list rides the instance channel
// (`teams_updated`) and membership rides the roster, each user row carrying
// its `teamIds`.

// The teams named, in the list's own order (by name).
export function teamsOf(teamIds: readonly string[]): Team[] {
  return instanceState.teams.filter((team) => teamIds.includes(team.id));
}

export function teamLabelsOf(teamIds: readonly string[]): string[] {
  return teamsOf(teamIds).map((team) => team.label);
}

export function teamMembers(teamId: string): RosterEntry[] {
  return instanceState.users.filter((user) => user.teamIds.includes(teamId));
}

// A user as a list names them: their name with the address, or the address.
export function personLabel(email: string): string {
  const user = instanceState.users.find((u) => u.email === email);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  return name ? `${name} (${email})` : email;
}
