import { z } from "zod";

// A scope is a named, admin-created row in `scopes`: a label and a definition
// with three dimensions (geography, time, data). A product carries one by id,
// and every figure read resolves under the pair (package, scope). `null`
// means unconstrained at every level, so the definition with every part null
// filters nothing. The server builds the definition into the DuckDB view each
// query runs against (scopePredicateFor, server/run_query/run_read.ts).

const idListSchema = z.array(z.string().min(1)).nullable();

// The view predicate converts a year to the results object's time column, and
// that conversion reads a value's format off its digit count.
const fourDigitYear = z.number().int().min(1000).max(9999);

export const scopeDefinitionSchema = z.strictObject({
  geography: z.strictObject({ adminArea2: z.string().min(1) }).nullable(),
  time: z.strictObject({
    years: z
      .strictObject({ start: fourDigitYear, end: fourDigitYear })
      .refine((y) => y.start <= y.end, "start must not be after end")
      .nullable(),
    hfaTimePoints: idListSchema,
  }),
  modules: idListSchema,
  indicators: z.strictObject({
    hmis: idListSchema, // column indicator_common_id
    hfa: idListSchema, // column hfa_indicator
    iceh: idListSchema, // column iceh_indicator
  }),
});

export type ScopeDefinition = z.infer<typeof scopeDefinitionSchema>;

export const UNCONSTRAINED_SCOPE_DEFINITION: ScopeDefinition = {
  geography: null,
  time: { years: null, hfaTimePoints: null },
  modules: null,
  indicators: { hmis: null, hfa: null, iceh: null },
};

export function parseScopeDefinition(raw: string): ScopeDefinition {
  return scopeDefinitionSchema.parse(JSON.parse(raw));
}

export function geographyOnlyScopeDefinition(
  adminArea2: string | null,
): ScopeDefinition {
  return {
    ...UNCONSTRAINED_SCOPE_DEFINITION,
    geography: adminArea2 === null ? null : { adminArea2 },
  };
}

// What a client holds for a scope (instance T1). `definitionHash` is derived
// on read and never stored.
export type Scope = {
  id: string;
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

type Canonical = string | number | Canonical[] | { [key: string]: Canonical };

// The hashed form holds only the constrained parts: a null is left out at
// every level, and so is an object left empty by that, so a dimension added
// later leaves every existing hash unchanged. Keys are sorted, lists are
// sorted and de-duplicated, and the area is upper-cased because the view
// predicate compares it case-insensitively.
function canonicalValue(value: unknown, key: string): Canonical | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    return key === "adminArea2" ? value.toUpperCase() : value;
  }
  if (typeof value === "number") return value;
  if (Array.isArray(value)) {
    return [...new Set(value.map(String))].toSorted();
  }
  const out: { [key: string]: Canonical } = {};
  for (const childKey of Object.keys(value).toSorted()) {
    const child = canonicalValue(
      (value as Record<string, unknown>)[childKey],
      childKey,
    );
    if (child !== undefined) out[childKey] = child;
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

// The token for a definition in every server cache key, response-holder stamp,
// client cache key and figure stamp. Two definitions that filter the same way
// hash the same, whatever their labels or ids.
export function scopeDefinitionHash(definition: ScopeDefinition): string {
  return sha256Hex(JSON.stringify(canonicalValue(definition, "") ?? {}));
}

// A read with no scope (`scopeId: null` on the wire) is the whole package.
export const WHOLE_PACKAGE_DEFINITION_HASH = scopeDefinitionHash(
  UNCONSTRAINED_SCOPE_DEFINITION,
);

// PackageScope is the (package, scope) pair every figure read resolves
// under: the results package a product is attached to (`products.run_id`) and
// its scope (`products.scope_id`). A null scope is the whole package, which
// only a surface with no product uses (the package page, /mcp). The pair
// never enters a figure's stored config or its fetch hash: a data-layer knob
// there causes spurious refetches and gets frozen into stored snapshots.

export type PackageScope = {
  runId: string;
  scopeId: string | null;
};

export function packageScopesEqual(a: PackageScope, b: PackageScope): boolean {
  return a.runId === b.runId && a.scopeId === b.scopeId;
}

// A pair with its scope looked up in the scopes list: the definition hash is
// the token in cache keys and figure stamps and the other half of the stale
// check, and the area drives the roll-up row label and the Explore level. A
// scope id that the list does not hold resolves to a hash no payload carries,
// so nothing is read or written under another scope's key.
export type ResolvedPackageScope = PackageScope & {
  definitionHash: string;
  adminArea2: string | null;
};

export function resolvePackageScope(
  scope: PackageScope,
  scopes: Scope[],
): ResolvedPackageScope {
  if (scope.scopeId === null) {
    return {
      ...scope,
      definitionHash: WHOLE_PACKAGE_DEFINITION_HASH,
      adminArea2: null,
    };
  }
  const found = scopes.find((s) => s.id === scope.scopeId);
  return {
    ...scope,
    definitionHash: found?.definitionHash ?? `missing:${scope.scopeId}`,
    adminArea2: found?.definition.geography?.adminArea2 ?? null,
  };
}
