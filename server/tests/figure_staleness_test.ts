// Harness for the stale predicate: the four combinations of matching and
// mismatching package and scope definition hash, the two walks over slide
// layouts and report registries, and the stored-figure transform that carries
// a figure stamped before scopes had a definition across without changing
// whether it is stale. The client module has type-only imports, so it loads
// under Deno as it is.
//
//   deno test -A --env-file server/tests/figure_staleness_test.ts

import { assertEquals } from "@std/assert";
import {
  ALL_DATA_DEFINITION_HASH,
  ALL_DATA_SCOPE_DEFINITION,
  type FigureBundle,
  geographyOnlyScopeDefinition,
  parseScopeDefinition,
  type ResolvedPackageScope,
  resolvePackageScope,
  type Scope,
  scopeDefinitionHash,
} from "lib";
import {
  findStaleFiguresInLayout,
  findStaleFiguresInReport,
  isFigureBundleStale,
} from "../../client/src/generate_visualization/figure_staleness.ts";
import {
  type FigureBlockMut,
  transformFigureBlock,
} from "../db/migrations/data_transforms/_figure_block.ts";

const RUN_A = "00000000-0000-4000-8000-00000000000a";
const RUN_B = "00000000-0000-4000-8000-00000000000b";

const KANO_HASH = scopeDefinitionHash(geographyOnlyScopeDefinition("Kano"));
const LAGOS_HASH = scopeDefinitionHash(geographyOnlyScopeDefinition("Lagos"));

// The predicate reads only `scope` and `provenance`; the rest of the bundle
// is irrelevant to it, so the fixture carries only those two fields.
function bundle(runId: string, definitionHash: string): FigureBundle {
  return {
    provenance: { runId },
    scope: { definitionHash, adminArea2: null },
  } as FigureBundle;
}

const CONTAINER: ResolvedPackageScope = {
  runId: RUN_A,
  scopeId: "scope-kano",
  definitionHash: KANO_HASH,
  areas: { hmis: "Kano", hfa: "Kano" },
};

Deno.test("stale: matching run and matching definition is not stale", () => {
  assertEquals(isFigureBundleStale(bundle(RUN_A, KANO_HASH), CONTAINER), false);
});

Deno.test("stale: mismatching run with matching definition is stale", () => {
  assertEquals(isFigureBundleStale(bundle(RUN_B, KANO_HASH), CONTAINER), true);
});

Deno.test("stale: matching run with mismatching definition is stale", () => {
  assertEquals(
    isFigureBundleStale(
      bundle(RUN_A, ALL_DATA_DEFINITION_HASH),
      CONTAINER,
    ),
    true,
  );
  assertEquals(isFigureBundleStale(bundle(RUN_A, LAGOS_HASH), CONTAINER), true);
});

Deno.test("stale: mismatching run and mismatching definition is stale", () => {
  assertEquals(
    isFigureBundleStale(
      bundle(RUN_B, ALL_DATA_DEFINITION_HASH),
      CONTAINER,
    ),
    true,
  );
});

Deno.test("stale: editing a scope's definition makes its figures stale", () => {
  const scope = (definition: Scope["definition"]): Scope => ({
    id: "scope-kano",
    label: "Kano",
    definition,
    definitionHash: scopeDefinitionHash(definition),
    lastUpdated: "2026-10-01T00:00:00.000Z",
  });
  const pair = { runId: RUN_A, scopeId: "scope-kano" };
  const before = resolvePackageScope(pair, [
    scope(geographyOnlyScopeDefinition("Kano")),
  ]);
  const figure = bundle(RUN_A, before.definitionHash);
  assertEquals(isFigureBundleStale(figure, before), false);

  const after = resolvePackageScope(pair, [
    scope({
      ...geographyOnlyScopeDefinition("Kano"),
      iceh: {
        include: true,
        modules: null,
        indicators: null,
        years: { start: 2020, end: 2022 },
      },
    }),
  ]);
  assertEquals(isFigureBundleStale(figure, after), true);
});

Deno.test("stale: a pair resolves to a listed scope, with each family's own area, or to a hash nothing carries", () => {
  const definition: Scope["definition"] = {
    ...ALL_DATA_SCOPE_DEFINITION,
    hmis: { ...ALL_DATA_SCOPE_DEFINITION.hmis, adminArea2: "Kano" },
    hfa: { include: false },
  } as Scope["definition"];
  const listed = resolvePackageScope({ runId: RUN_A, scopeId: "s1" }, [{
    id: "s1",
    label: "Kano HMIS",
    definition,
    definitionHash: scopeDefinitionHash(definition),
    lastUpdated: "2026-10-01T00:00:00.000Z",
  }]);
  assertEquals(listed.definitionHash, scopeDefinitionHash(definition));
  assertEquals(listed.areas, { hmis: "Kano", hfa: null });
  const missing = resolvePackageScope({ runId: RUN_A, scopeId: "gone" }, []);
  assertEquals(missing.definitionHash, "missing:gone");
  assertEquals(missing.areas, { hmis: null, hfa: null });
});

Deno.test("stale: the layout walk reports figure blocks with a bundle, in layout order", () => {
  const layout = {
    type: "rows",
    id: "root",
    children: [
      {
        type: "item",
        id: "b1",
        data: { type: "figure", bundle: bundle(RUN_B, KANO_HASH) },
      },
      { type: "item", id: "b2", data: { type: "text", text: "" } },
      { type: "item", id: "b3", data: { type: "figure" } },
      {
        type: "item",
        id: "b4",
        data: { type: "figure", bundle: bundle(RUN_A, KANO_HASH) },
      },
      {
        type: "item",
        id: "b5",
        data: {
          type: "figure",
          bundle: bundle(RUN_A, ALL_DATA_DEFINITION_HASH),
        },
      },
    ],
  } as unknown as Parameters<typeof findStaleFiguresInLayout>[0];
  assertEquals(
    findStaleFiguresInLayout(layout, CONTAINER).map((s) => s.blockId),
    ["b1", "b5"],
  );
});

Deno.test("stale: the report walk reports registry entries with a stale bundle", () => {
  const figures = {
    f1: { type: "figure" as const, bundle: bundle(RUN_A, KANO_HASH) },
    f2: { type: "figure" as const },
    f3: { type: "figure" as const, bundle: bundle(RUN_B, KANO_HASH) },
  };
  assertEquals(
    findStaleFiguresInReport(figures, CONTAINER).map((s) => s.figureId),
    ["f3"],
  );
});

// Migration 204 gives a product whose admin_area_2 was "Kano" a scope whose
// HMIS and HFA sections both carry that area, and a national product the "All
// data" scope. The transform stamps each legacy bundle from its OWN area, so
// the comparison against the product's scope comes out as it did before.

function legacyBlock(adminArea2: string | null): FigureBlockMut {
  return {
    type: "figure",
    bundle: { provenance: { runId: RUN_A }, scope: { adminArea2 } },
  } as unknown as FigureBlockMut;
}

function transformed(adminArea2: string | null): FigureBundle {
  const block = legacyBlock(adminArea2);
  transformFigureBlock(block);
  return block.bundle as unknown as FigureBundle;
}

function productOn(adminArea2: string | null): ResolvedPackageScope {
  return {
    runId: RUN_A,
    scopeId: "migrated",
    definitionHash: scopeDefinitionHash(
      geographyOnlyScopeDefinition(adminArea2),
    ),
    areas: { hmis: adminArea2, hfa: adminArea2 },
  };
}

Deno.test("transform: a legacy bundle whose area matches its product stays fresh", () => {
  const kano = transformed("Kano");
  assertEquals(kano.scope, { definitionHash: KANO_HASH, adminArea2: "Kano" });
  assertEquals(isFigureBundleStale(kano, productOn("Kano")), false);

  const national = transformed(null);
  assertEquals(national.scope, {
    definitionHash: ALL_DATA_DEFINITION_HASH,
    adminArea2: null,
  });
  assertEquals(isFigureBundleStale(national, productOn(null)), false);
});

Deno.test("transform: a legacy bundle whose area differs from its product stays stale", () => {
  assertEquals(
    isFigureBundleStale(transformed("Lagos"), productOn("Kano")),
    true,
  );
  assertEquals(isFigureBundleStale(transformed(null), productOn("Kano")), true);
  assertEquals(isFigureBundleStale(transformed("Kano"), productOn(null)), true);
});

Deno.test("transform: a bundle already carrying the hash is left alone", () => {
  const block = {
    type: "figure",
    bundle: {
      provenance: { runId: RUN_A },
      scope: { definitionHash: "kept", adminArea2: "Kano" },
    },
  } as unknown as FigureBlockMut;
  transformFigureBlock(block);
  assertEquals((block.bundle as unknown as FigureBundle).scope, {
    definitionHash: "kept",
    adminArea2: "Kano",
  });
});

// The "All data" definition is written three times: in lib, as a literal in
// migration 204, and by the transform for a national bundle. A national
// figure stays fresh only while all three hash the same. Migration 206 adds
// the HFA section's two category lists to the seeded row as null, applied
// here by hand; ./validate_migrations_replay runs the real pair.
Deno.test("transform: migration 204's All data literal hashes as the transform stamps a national bundle", async () => {
  const sql = await Deno.readTextFile(
    new URL("../db/migrations/instance/204_scopes.sql", import.meta.url),
  );
  const literal = sql.match(/'(\{"hmis":.*\})'/)?.[1];
  assertEquals(typeof literal, "string");
  const raw = JSON.parse(literal!);
  const seeded = parseScopeDefinition(JSON.stringify({
    ...raw,
    hfa: { ...raw.hfa, categories: null, serviceCategories: null },
  }));
  assertEquals(seeded, ALL_DATA_SCOPE_DEFINITION);
  assertEquals(
    scopeDefinitionHash(seeded),
    transformed(null).scope.definitionHash,
  );
});
