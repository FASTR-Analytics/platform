// Pins the one level derivation: a global admin and the owner hold own,
// everyone else the highest of the general access, their own grant and the
// grants of the teams they are in.
//
//   deno test -A server/tests/product_level_test.ts

import { assertEquals } from "@std/assert";
import {
  type ProductAccess,
  type ProductDefaultAccess,
  type ProductGrantLevel,
  type ProductLevel,
  productLevelAtLeast,
  productLevelFor,
  productLevelTeamIds,
  type ProductTeamGrant,
  teamIdsEqual,
} from "lib";

const OWNER = "owner@example.com";
const USER = "user@example.com";

function access(
  defaultAccess: ProductDefaultAccess,
  grant: ProductGrantLevel | null,
): ProductAccess {
  return {
    owner: OWNER,
    defaultAccess,
    teamGrants: [],
    grants: grant === null ? [] : [{ email: USER, level: grant }],
  };
}

const user = (
  email: string,
  isGlobalAdmin = false,
  teamIds: string[] = [],
) => ({
  email,
  isGlobalAdmin,
  teamIds,
});

Deno.test("productLevelAtLeast orders none, view, edit, own", () => {
  const levels: ProductLevel[] = ["none", "view", "edit", "own"];
  for (const [i, level] of levels.entries()) {
    for (const [j, required] of levels.entries()) {
      assertEquals(
        productLevelAtLeast(level, required),
        i >= j,
        `${level} >= ${required}`,
      );
    }
  }
});

Deno.test("a global admin owns every product, with or without an owner", () => {
  const admin = user("admin@example.com", true);
  assertEquals(productLevelFor(access("none", null), admin), "own");
  assertEquals(
    productLevelFor({
      owner: null,
      defaultAccess: "none",
      teamGrants: [],
      grants: [],
    }, admin),
    "own",
  );
});

Deno.test("the owner owns the product whatever the general access", () => {
  for (const defaultAccess of ["none", "view", "edit"] as const) {
    assertEquals(
      productLevelFor(access(defaultAccess, null), user(OWNER)),
      "own",
    );
  }
});

Deno.test("a grantee holds the higher of their grant and the general access", () => {
  const cases: [ProductDefaultAccess, ProductGrantLevel, ProductLevel][] = [
    ["none", "view", "view"],
    ["none", "edit", "edit"],
    ["view", "view", "view"],
    ["view", "edit", "edit"],
    ["edit", "view", "edit"],
    ["edit", "edit", "edit"],
  ];
  for (const [defaultAccess, grant, expected] of cases) {
    assertEquals(
      productLevelFor(access(defaultAccess, grant), user(USER)),
      expected,
      `general ${defaultAccess}, grant ${grant}`,
    );
  }
});

Deno.test("a user with neither grant nor ownership holds the general access", () => {
  for (const defaultAccess of ["none", "view", "edit"] as const) {
    assertEquals(
      productLevelFor(access(defaultAccess, "edit"), user("other@example.com")),
      defaultAccess,
    );
  }
});

// Teams: a team's grant reaches its members only, the highest source wins,
// and no source lowers another.

const TEAM_A = "11111111-1111-4111-8111-111111111111";
const TEAM_B = "22222222-2222-4222-8222-222222222222";

function teamAccess(
  defaultAccess: ProductDefaultAccess,
  grant: ProductGrantLevel | null,
  teamGrants: ProductTeamGrant[],
): ProductAccess {
  return { ...access(defaultAccess, grant), teamGrants };
}

Deno.test("a team grant reaches a member and nobody else", () => {
  const shared = teamAccess("none", null, [{ teamId: TEAM_A, level: "edit" }]);
  assertEquals(productLevelFor(shared, user(USER, false, [TEAM_A])), "edit");
  assertEquals(productLevelFor(shared, user(USER, false, [TEAM_B])), "none");
  assertEquals(productLevelFor(shared, user(USER)), "none");
});

Deno.test("the highest of the general access, the own grant and every team grant wins", () => {
  const cases: [
    ProductDefaultAccess,
    ProductGrantLevel | null,
    ProductTeamGrant[],
    ProductLevel,
  ][] = [
    // A personal view grant never holds a member below their team's edit.
    ["none", "view", [{ teamId: TEAM_A, level: "edit" }], "edit"],
    // A team's view grant never lowers a personal edit grant.
    ["none", "edit", [{ teamId: TEAM_A, level: "view" }], "edit"],
    // Nor the general access.
    ["edit", null, [{ teamId: TEAM_A, level: "view" }], "edit"],
    // Two teams: the higher one.
    ["none", null, [
      { teamId: TEAM_A, level: "view" },
      { teamId: TEAM_B, level: "edit" },
    ], "edit"],
    ["view", null, [{ teamId: TEAM_A, level: "view" }], "view"],
  ];
  for (const [defaultAccess, grant, teamGrants, expected] of cases) {
    assertEquals(
      productLevelFor(
        teamAccess(defaultAccess, grant, teamGrants),
        user(USER, false, [TEAM_A, TEAM_B]),
      ),
      expected,
      `general ${defaultAccess}, grant ${grant}, teams ${
        teamGrants.map((g) => g.level).join("+")
      }`,
    );
  }
});

Deno.test("a team grant gives an owner and an admin nothing they lack", () => {
  const shared = teamAccess("none", null, [{ teamId: TEAM_A, level: "view" }]);
  assertEquals(productLevelFor(shared, user(OWNER, false, [TEAM_A])), "own");
  assertEquals(
    productLevelFor(shared, user("admin@example.com", true, [TEAM_A])),
    "own",
  );
});

Deno.test("productLevelTeamIds names the teams a level comes from", () => {
  const member = user(USER, false, [TEAM_A, TEAM_B]);
  // The team is the only source of edit.
  assertEquals(
    productLevelTeamIds(
      teamAccess("none", "view", [{ teamId: TEAM_A, level: "edit" }]),
      member,
    ),
    [TEAM_A],
  );
  // Both teams give the level held.
  assertEquals(
    productLevelTeamIds(
      teamAccess("none", null, [
        { teamId: TEAM_A, level: "view" },
        { teamId: TEAM_B, level: "view" },
      ]),
      member,
    ),
    [TEAM_A, TEAM_B],
  );
  // The own grant, the general access and ownership each already give the
  // level, so no team is named.
  assertEquals(
    productLevelTeamIds(
      teamAccess("none", "edit", [{ teamId: TEAM_A, level: "edit" }]),
      member,
    ),
    [],
  );
  assertEquals(
    productLevelTeamIds(
      teamAccess("view", null, [{ teamId: TEAM_A, level: "view" }]),
      member,
    ),
    [],
  );
  assertEquals(
    productLevelTeamIds(
      teamAccess("none", null, [{ teamId: TEAM_A, level: "edit" }]),
      user(OWNER, false, [TEAM_A]),
    ),
    [],
  );
  // A team the user is not in is never named.
  assertEquals(
    productLevelTeamIds(
      teamAccess("none", null, [{ teamId: TEAM_A, level: "edit" }]),
      user(USER, false, [TEAM_B]),
    ),
    [],
  );
});

Deno.test("teamIdsEqual ignores order and sees a joined or left team", () => {
  assertEquals(teamIdsEqual([TEAM_A, TEAM_B], [TEAM_B, TEAM_A]), true);
  assertEquals(teamIdsEqual([], []), true);
  assertEquals(teamIdsEqual([TEAM_A], [TEAM_A, TEAM_B]), false);
  assertEquals(teamIdsEqual([TEAM_A], [TEAM_B]), false);
});
