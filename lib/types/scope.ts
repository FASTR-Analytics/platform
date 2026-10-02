import { z } from "zod";
import type { DatasetType } from "./datasets.ts";

// A scope is a named, admin-created row in `scopes`: a label and a definition
// with one section per dataset family. A section is excluded, or included
// with that family's dimensions (area, years or time points, modules,
// indicators, and for HFA categories and service categories). Inside an
// included section `null` means no limit on that dimension and nothing else;
// the only way to drop a family is `include: false`. A product carries a
// scope by id, and every figure read resolves under the pair (package,
// scope). The server builds the definition into the DuckDB view each query
// runs against (scopePredicateFor, server/run_query/run_read.ts).

// The one reserved scope: every section included, no dimension limited. Its
// row is seeded by migration 204 and can be neither edited nor deleted.
export const ALL_DATA_SCOPE_ID = "all-data";

// The id of an admin-created scope, the type crypto.randomUUID() returns. A
// grant is always one of these: "All data" has one hyphen, so it is not a
// ScopeUuid, and holding all data is `ScopeAccess` `{ all: true }`.
export type ScopeUuid = `${string}-${string}-${string}-${string}-${string}`;

export type ScopeId = typeof ALL_DATA_SCOPE_ID | ScopeUuid;

const uuidSchema = z.uuid();

export const scopeUuidSchema = z.custom<ScopeUuid>(
  (value) => uuidSchema.safeParse(value).success,
  "Invalid UUID",
);

export const scopeIdSchema = z.union([
  z.literal(ALL_DATA_SCOPE_ID),
  scopeUuidSchema,
]);

// An empty list would match no data, which is what `include: false` says.
const idListSchema = z.array(z.string().min(1)).min(1).nullable();

const adminArea2Schema = z.string().min(1).nullable();

// The view predicate converts a year to the results object's time column, and
// that conversion reads a value's format off its digit count.
const fourDigitYear = z.number().int().min(1000).max(9999);

const yearRangeSchema = z
  .strictObject({ start: fourDigitYear, end: fourDigitYear })
  .refine((y) => y.start <= y.end, "start must not be after end")
  .nullable();

const excludedSectionSchema = z.strictObject({ include: z.literal(false) });

// `modules` lists only the section's own family's modules, and `indicators`
// filters that family's indicator column (SCOPE_INDICATOR_COLUMN).
const includedSection = {
  include: z.literal(true),
  modules: idListSchema,
  indicators: idListSchema,
};

export const scopeDefinitionSchema = z.strictObject({
  hmis: z.discriminatedUnion("include", [
    excludedSectionSchema,
    z.strictObject({
      ...includedSection,
      adminArea2: adminArea2Schema,
      years: yearRangeSchema,
    }),
  ]),
  hfa: z.discriminatedUnion("include", [
    excludedSectionSchema,
    z.strictObject({
      ...includedSection,
      adminArea2: adminArea2Schema,
      timePoints: idListSchema,
      categories: idListSchema,
      serviceCategories: idListSchema,
    }),
  ]),
  iceh: z.discriminatedUnion("include", [
    excludedSectionSchema,
    z.strictObject({ ...includedSection, years: yearRangeSchema }),
  ]),
});

export type ScopeDefinition = z.infer<typeof scopeDefinitionSchema>;

export type YearRange = { start: number; end: number };

export const SCOPE_INDICATOR_COLUMN = {
  hmis: "indicator_common_id",
  hfa: "hfa_indicator",
  iceh: "iceh_indicator",
} as const satisfies Record<DatasetType, string>;

export function parseScopeDefinition(raw: string): ScopeDefinition {
  return scopeDefinitionSchema.parse(JSON.parse(raw));
}

// Limited by geography alone: HMIS and HFA both carry the area, and ICEH,
// which has no geography, is included whole. What a product on one admin
// area 2 showed before scopes had sections.
export function geographyOnlyScopeDefinition(
  adminArea2: string | null,
): ScopeDefinition {
  const unlimited = { include: true, modules: null, indicators: null } as const;
  return {
    hmis: { ...unlimited, adminArea2, years: null },
    hfa: {
      ...unlimited,
      adminArea2,
      timePoints: null,
      categories: null,
      serviceCategories: null,
    },
    iceh: { ...unlimited, years: null },
  };
}

export const ALL_DATA_SCOPE_DEFINITION = geographyOnlyScopeDefinition(null);

// The area a definition holds a family's tables to. ICEH has no geography.
export type ScopeAreas = { hmis: string | null; hfa: string | null };

export function scopeAreasOf(definition: ScopeDefinition): ScopeAreas {
  return {
    hmis: definition.hmis.include ? definition.hmis.adminArea2 : null,
    hfa: definition.hfa.include ? definition.hfa.adminArea2 : null,
  };
}

export function scopeAreaForFamily(
  areas: ScopeAreas,
  family: DatasetType | undefined,
): string | null {
  return family === "hmis" || family === "hfa" ? areas[family] : null;
}

// What a client holds for a scope (instance T1). `definitionHash` is derived
// on read and never stored.
export type Scope = {
  id: ScopeId;
  label: string;
  definition: ScopeDefinition;
  definitionHash: string;
  lastUpdated: string;
};

// crypto.subtle is async and the hash is needed synchronously on both tiers
// (cache keys are built inside synchronous key functions).
const SHA256_ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98,
  0x71374491,
  0xb5c0fbcf,
  0xe9b5dba5,
  0x3956c25b,
  0x59f111f1,
  0x923f82a4,
  0xab1c5ed5,
  0xd807aa98,
  0x12835b01,
  0x243185be,
  0x550c7dc3,
  0x72be5d74,
  0x80deb1fe,
  0x9bdc06a7,
  0xc19bf174,
  0xe49b69c1,
  0xefbe4786,
  0x0fc19dc6,
  0x240ca1cc,
  0x2de92c6f,
  0x4a7484aa,
  0x5cb0a9dc,
  0x76f988da,
  0x983e5152,
  0xa831c66d,
  0xb00327c8,
  0xbf597fc7,
  0xc6e00bf3,
  0xd5a79147,
  0x06ca6351,
  0x14292967,
  0x27b70a85,
  0x2e1b2138,
  0x4d2c6dfc,
  0x53380d13,
  0x650a7354,
  0x766a0abb,
  0x81c2c92e,
  0x92722c85,
  0xa2bfe8a1,
  0xa81a664b,
  0xc24b8b70,
  0xc76c51a3,
  0xd192e819,
  0xd6990624,
  0xf40e3585,
  0x106aa070,
  0x19a4c116,
  0x1e376c08,
  0x2748774c,
  0x34b0bcb5,
  0x391c0cb3,
  0x4ed8aa4a,
  0x5b9cca4f,
  0x682e6ff3,
  0x748f82ee,
  0x78a5636f,
  0x84c87814,
  0x8cc70208,
  0x90befffa,
  0xa4506ceb,
  0xbef9a3f7,
  0xc67178f2,
]);

function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bytes.length / 0x20000000));
  view.setUint32(paddedLength - 4, (bytes.length << 3) >>> 0);
  const h = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + s1 + ch + SHA256_ROUND_CONSTANTS[i] + w[i]) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, "0")).join("");
}

type Canonical =
  | string
  | number
  | boolean
  | Canonical[]
  | { [key: string]: Canonical };

// The hashed form holds only the limited parts: a null is left out at every
// level, so a dimension added later leaves every existing hash unchanged.
// `include` is always kept. Keys are sorted, lists are sorted and
// de-duplicated, and an area and the service categories are upper-cased
// because the view predicate compares them case-insensitively.
function canonicalValue(value: unknown, key: string): Canonical | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return key === "adminArea2" ? value.toUpperCase() : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    const items = value.map(String);
    return [
      ...new Set(
        key === "serviceCategories"
          ? items.map((item) => item.toUpperCase())
          : items,
      ),
    ].toSorted();
  }
  const out: { [key: string]: Canonical } = {};
  for (const childKey of Object.keys(value).toSorted()) {
    const child = canonicalValue(
      (value as Record<string, unknown>)[childKey],
      childKey,
    );
    if (child !== undefined) {
      out[childKey] = child;
    }
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

// The token for a definition in every server cache key, response-holder stamp,
// client cache key and figure stamp. Two definitions that filter the same way
// hash the same, whatever their labels or ids.
export function scopeDefinitionHash(definition: ScopeDefinition): string {
  return sha256Hex(JSON.stringify(canonicalValue(definition, "") ?? {}));
}

export const ALL_DATA_DEFINITION_HASH = scopeDefinitionHash(
  ALL_DATA_SCOPE_DEFINITION,
);

// PackageScope is the (package, scope) pair every figure read resolves
// under: the results package a product is attached to (`products.run_id`) and
// its scope (`products.scope_id`). A surface with no product (the package
// page, Explore, /mcp) names its scope too, "All data" by default: there is
// no null scope. The pair never enters a figure's stored config or its fetch
// hash: a data-layer knob there causes spurious refetches and gets frozen
// into stored snapshots.

export type PackageScope = {
  runId: string;
  scopeId: ScopeId;
};

export function packageScopesEqual(a: PackageScope, b: PackageScope): boolean {
  return a.runId === b.runId && a.scopeId === b.scopeId;
}

// A pair with its scope looked up in the scopes list: the definition hash is
// the token in cache keys and figure stamps and the other half of the stale
// check, and the areas drive the roll-up row label and the Explore level. A
// scope id that the list does not hold resolves to a hash no payload carries,
// so nothing is read or written under another scope's key.
export type ResolvedPackageScope = PackageScope & {
  definitionHash: string;
  areas: ScopeAreas;
};

export function resolvePackageScope(
  scope: PackageScope,
  scopes: Scope[],
): ResolvedPackageScope {
  const found = scopes.find((s) => s.id === scope.scopeId);
  return {
    ...scope,
    definitionHash: found?.definitionHash ?? `missing:${scope.scopeId}`,
    areas: found === undefined
      ? { hmis: null, hfa: null }
      : scopeAreasOf(found.definition),
  };
}
