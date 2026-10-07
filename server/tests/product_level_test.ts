// Pins the one level derivation (PLAN_PRODUCT_OWNERSHIP R8): a global admin
// and the owner hold own, everyone else the higher of their grant and the
// general access.
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
    grants: grant === null ? [] : [{ email: USER, level: grant }],
  };
}

const user = (email: string, isGlobalAdmin = false) => ({
  email,
  isGlobalAdmin,
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
    productLevelFor({ owner: null, defaultAccess: "none", grants: [] }, admin),
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
