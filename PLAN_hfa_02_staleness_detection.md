# Plan: HFA Staleness Detection

Surface a "data needs updating" warning on the HFA card in Project Data when instance-level HFA data, indicators, structure, or facility config have changed since the project's last export.

Depends on nothing. Can ship independently of [PLAN_hfa_01_indicator_snapshot.md](PLAN_hfa_01_indicator_snapshot.md). However, shipping Plan 02 alone means the "Update data" action re-exports the CSV but does not guarantee indicator/data consistency — the next module run still reads live indicators from mainDb. The staleness warning is only fully actionable once Plan 01's snapshot is also in place. Prefer shipping both together.

## Current state

- [project_data.tsx:319](client/src/components/project/project_data.tsx#L319) has `projectVersion = () => 999999` — the HFA card never shows staleness.
- [datasets_in_project_hfa.ts:140](server/db/project/datasets_in_project_hfa.ts#L140) stores `info = JSON.stringify({})` — no metadata to compare against.
- The HFA variant of `DatasetInProject` has `info: undefined` — no type support for HFA metadata.
- HMIS already has comprehensive staleness detection with reasons list. HFA should match.

## Changes

### Design principles

Four rules that shape every choice below:

1. **All staleness fields are optional** on the type. Legacy rows exist as `info = '{}'`; the type should reflect reality, not force a lying cast. Matches `DatasetHmisInfoInProject`'s shape.
2. **Store hashes, never structures.** Comparing `JSON.stringify(config) !== JSON.stringify(config)` is key-order-fragile. Server-side canonical hashes turn every staleness signal into a string-equality comparison.
3. **One uniform comparison rule for all signals** — `instance[key] !== project[key]`. No directional checks, no mixed truthy guards. A missing project-side value naturally differs from any instance value.
4. **Legacy data is migrated, not special-cased in every check.** Existing `info = '{}'` rows get an explicit `_legacy: true` flag so the client branches once, clearly.

### 1. Add `DatasetHfaInfoInProject` type

**File:** [lib/types/datasets_in_project.ts](lib/types/datasets_in_project.ts)

```ts
export type DatasetHfaInfoInProject = {
  _legacy?: true;
  hfaCacheHash?: string;
  hfaIndicatorsVersion?: string;
  structureLastUpdated?: string;
  facilityColumnsHash?: string;
};
```

Change the HFA variant of `DatasetInProject` from `info: undefined` to `info: DatasetHfaInfoInProject`.

All fields optional. `facilityColumnsHash` replaces the idea of storing the raw config — see §2.

### 2. Server-side: canonical facility-columns hash helper

**New file or addition to** [server/db/instance/config.ts](server/db/instance/config.ts):

```ts
export function hashFacilityColumnsConfig(
  config: InstanceConfigFacilityColumns,
): string {
  // Canonical: sorted keys → JSON → MD5. Stable across key-order variations.
  const sorted = Object.fromEntries(
    Object.keys(config).sort().map((k) => [k, config[k as keyof typeof config]])
  );
  return crypto.createHash("md5").update(JSON.stringify(sorted)).digest("hex");
}
```

Used by both the HFA export path (§3) and the client staleness provider (§5) — the instance-state provider computes the hash from the live config so the client compares hash-to-hash.

### 3. Store metadata snapshot at export time

**File:** [server/db/project/datasets_in_project_hfa.ts](server/db/project/datasets_in_project_hfa.ts) (~line 140)

Replace `JSON.stringify({})` with actual snapshots. `facilityConfig` is already in scope (line 44). Additionally fetch:

- `hfaCacheHash` via `computeHfaCacheHash()` — captures whether HFA data rounds have changed.
- `hfaIndicatorsVersion` via `getHfaIndicatorsVersion(mainDb)` — captures whether indicator definitions or their R code have changed.
- `structureLastUpdated` — from `instance_config` key `'structure_last_updated'`. Shared with HMIS (facilities/admin areas are shared).
- `facilityColumnsHash` via `hashFacilityColumnsConfig(facilityConfig)`.

```ts
const info: DatasetHfaInfoInProject = {
  hfaCacheHash: await computeHfaCacheHash(mainDb),
  hfaIndicatorsVersion: await getHfaIndicatorsVersion(mainDb),
  structureLastUpdated,
  facilityColumnsHash: hashFacilityColumnsConfig(facilityConfig),
};
```

### 4. Parse HFA info in getProjectDetail

**File:** [server/db/project/projects.ts](server/db/project/projects.ts) (~line 77-81)

```ts
return { datasetType: "hfa", info: parseJsonOrThrow(row.info), dateExported: row.last_updated };
```

No legacy special-case here — handled by migration in §5.

### 5. Migrate legacy rows explicitly

**New migration:** `server/db/migrations/project/011_mark_legacy_hfa_exports.sql`

```sql
UPDATE datasets
SET info = '{"_legacy": true}'
WHERE dataset_type = 'hfa' AND info = '{}';
```

After this migration runs, every HFA `info` row is one of two shapes: `{ _legacy: true }` (never had staleness metadata) or `{ hfaCacheHash, hfaIndicatorsVersion, structureLastUpdated, facilityColumnsHash }` (exported post-Plan-02). The client's legacy branch becomes one explicit check, not an implicit consequence of four falsy-shortcircuits.

### 6. Client staleness detection

**File:** [client/src/components/project/project_data.tsx](client/src/components/project/project_data.tsx) (~lines 318-407)

Replace the `999999` TODO with a uniform-rule check:

```ts
const stalenessCheck = () => {
  const info = keyedProjectDatasetHfa.info;

  if (info._legacy) {
    return {
      isStale: true,
      reasons: [t3({
        en: "Exported before staleness tracking was added — re-export to enable change detection",
        fr: "Exporté avant le suivi de mise à jour — réexporter pour activer la détection",
      })],
    };
  }

  const checks: { instance: string | undefined; project: string | undefined; label: { en: string; fr: string } }[] = [
    {
      instance: instanceState.hfaCacheHash,
      project: info.hfaCacheHash,
      label: { en: "HFA dataset updated", fr: "Données HFA mises à jour" },
    },
    {
      instance: instanceState.hfaIndicatorsVersion,
      project: info.hfaIndicatorsVersion,
      label: { en: "HFA indicators changed", fr: "Indicateurs HFA modifiés" },
    },
    {
      instance: instanceState.structureLastUpdated,
      project: info.structureLastUpdated,
      label: { en: "Facilities or admin areas changed", fr: "Établissements ou unités administratives modifiés" },
    },
    {
      instance: instanceState.facilityColumnsHash,
      project: info.facilityColumnsHash,
      label: { en: "Facility configuration changed", fr: "Configuration des établissements modifiée" },
    },
  ];

  const reasons = checks
    .filter((c) => c.instance !== c.project)
    .map((c) => t3(c.label));

  return { isStale: reasons.length > 0, reasons };
};

const isStale = () => stalenessCheck().isStale;
```

Note `instanceState.facilityColumnsHash` — a new field. Add it alongside the existing `hfaCacheHash` / `hfaIndicatorsVersion` in [client/src/state/instance/t1_store.ts](client/src/state/instance/t1_store.ts), computed server-side via the same `hashFacilityColumnsConfig` helper and shipped down with the instance state payload.

Update the HFA card UI to show the reasons list with bullets (matching HMIS pattern) instead of the current raw version numbers display. The "Update data" button is a direct re-export — HFA has no windowing to edit, so no modal like HMIS's `editSettings(true)`.

**Dirty state propagation is already handled.** [project.ts:234](server/routes/project/project.ts#L234) calls `setModulesDirtyForDataset(c.var.ppk, body.datasetType)` after any dataset update.

## Files to modify

1. `lib/types/datasets_in_project.ts` — Add `DatasetHfaInfoInProject`, change HFA variant
2. `server/db/instance/config.ts` (or similar) — Add `hashFacilityColumnsConfig` helper
3. `server/db/project/datasets_in_project_hfa.ts` — Store snapshot in info JSON
4. `server/db/project/projects.ts` — Parse HFA info
5. `server/db/migrations/project/011_mark_legacy_hfa_exports.sql` — Mark legacy rows
6. Server payload that feeds `instanceState` — include `facilityColumnsHash`
7. `client/src/state/instance/t1_store.ts` — Add `facilityColumnsHash` field
8. `client/src/components/project/project_data.tsx` — Uniform staleness check + reasons UI

## Definition of done

- [ ] `DatasetHfaInfoInProject` type exists with all fields optional, including `_legacy` and `facilityColumnsHash`
- [ ] `hashFacilityColumnsConfig` is used both server-side at export time and in the instance-state payload
- [ ] `addDatasetHfaToProject` stores all four hash/version values in the `info` JSON
- [ ] Migration 011 marks legacy `{}` HFA rows with `{"_legacy": true}`
- [ ] `getProjectDetail` parses HFA `info` as `DatasetHfaInfoInProject`
- [ ] HFA card renders a single explicit legacy reason for `_legacy` rows, and the filtered uniform-rule reasons list otherwise
- [ ] Clicking "Update data" refreshes data + marks hfa001 dirty (already wired via `setModulesDirtyForDataset`)
- [ ] `deno task typecheck` clean
- [ ] Smoke test: legacy project → shows legacy reason → click Update → all four fields populated → card shows no staleness → change instance indicators → exactly "HFA indicators changed" appears in reasons
