import { assertEquals } from "@std/assert";
import { extractRIdentifiers, isReservedHfaId, unknownRFunctions } from "lib";

Deno.test("a call is not a variable reference", () => {
  assertEquals(
    extractRIdentifiers("is.na(a) | b %in% c(1, 2) AND cbind(d, e)"),
    ["a", "b", "d", "e"],
  );
});

Deno.test("only the language's functions are accepted", () => {
  assertEquals(unknownRFunctions("(a + b + c) / 3"), []);
  assertEquals(unknownRFunctions("pmax(a == 1, b == 1) & !is.na(d)"), []);
  assertEquals(
    unknownRFunctions("rowMeans(cbind(a, b), na.rm = TRUE) > sum(a, b)"),
    ["cbind", "rowMeans", "sum"],
  );
});

Deno.test("strings, comments and keywords are not calls", () => {
  assertEquals(unknownRFunctions('a == "foo(" # bar(\n'), []);
  assertEquals(unknownRFunctions("if (a == 1) 1 else 0"), []);
});

Deno.test("a variable may not be named after an accepted function", () => {
  assertEquals(isReservedHfaId("c"), true);
  assertEquals(isReservedHfaId("ifelse"), true);
  assertEquals(isReservedHfaId("sum"), false);
});
