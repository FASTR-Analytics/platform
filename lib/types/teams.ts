// Contract: the teams block in server/db/instance/_main_database.sql.

// A team is a named group of users that a product can grant a level to
// (ProductTeamGrant, lib/permissions). Its members are not on the row: every
// roster row carries the user's `teamIds`, so membership is read from the
// roster (teamMemberEmails).
export type Team = {
  id: string;
  label: string;
  description: string | null;
  // The products that grant the team a level across the whole instance,
  // derived on read, so a connection that sees only some of them still knows
  // how many a new member gains.
  productCount: number;
};

export function teamMemberEmails(
  users: readonly { email: string; teamIds: readonly string[] }[],
  teamId: string,
): string[] {
  return users.filter((u) => u.teamIds.includes(teamId)).map((u) => u.email);
}
