import {
  type APIResponseWithData,
  type DisaggregationOption,
  type GenericLongFormFetchConfig,
  hashFetchConfig,
  type ItemsHolderPresentationObject,
  type ReplicantOptionsForPresentationObject,
  type ResultsValueInfoForPresentationObject,
} from "lib";
import { TimCacheC } from "../../valkey/cache_class_C.ts";

// Bump when a code change alters the MEANING of a cached results payload (the
// runId key only tracks which immutable run the data came from, not code).
// Folding it into the versionHash invalidates the stale entries exactly once,
// then the caches resume hitting normally.
// "2": quarter_id format YYYY0Q → YYYYQ — pre-cutover results held 6-digit
// quarters that the new renderer (panther) rejects.
// "3": replicant-options now honor the self-column subset filter (get_possible_values
// no longer self-strips), so previously-cached full-value-set payloads are stale.
// "4": replicant-options now resolve RELATIVE period filters to exact bounds
// (and re-anchor from_month) like the items query — previously-cached lists
// for relative-filtered configs span all time.
// "5": hfa_service_category filtering changed from exact-match to set-membership
// (string_to_array overlap) — previously-cached payloads for configs filtering
// on this column used the old (wrong) semantics under an unchanged config hash.
// "6": NULL/blank now fold onto BLANK_SENTINEL. Both cached shapes change —
// possible-values gains the sentinel option, and items key their group on it
// instead of ''/null — and version hashes track row last_updated, not code, so
// unmodified rows would otherwise keep serving pre-fold payloads.
// "7": HFA items gained sample-size columns (__n_*) beside their values. The
// payload shape changes for unmodified rows, which version hashes don't track.
// "8": fetchConfig gained rollupDim replacing includeAdminAreaRollup+level.
// The hashFetchConfig segment change already orphans every old key, so this
// bump is declared hygiene rather than load-bearing — the shape of the cached
// ItemsHolder.fetchConfig changed, and safety should not rest on the
// incidental impossibility of an old/new key collision.
// "9": the PLAN_RESULTS_RUNS cutover (merged past both sides' independent
// bump histories — the results-runs branch used "6" for this change) —
// payloads are now sourced from the attached run (DuckDB over parquet:
// native numbers where postgres.js returned NUMERIC strings) and
// possible-values lists are re-sorted in TS with a pinned comparator
// (Intl.Collator en, numeric) so Postgres and DuckDB emit identical order —
// previously-cached entries hold pg-string values and DB-collation order.
// "10": the post-merge semantic batch changed payload semantics AFTER "9"
// was minted (blank-fold completion via manifest textColumns, trim() SQL) —
// entries cached in that window hold pre-batch payloads under "9".
// "11": the pinned option comparator changed from Intl.Collator (ICU —
// itself runtime-version-dependent, defeating the pin) to a hand-rolled
// code-point/numeric comparator in get_possible_values.ts — cached option
// lists hold the old ICU order where the two disagree (leading
// space/punctuation, accented values).
// "12": two changes shipping together. resultsValueInfo gained
// `indicatorFormats` (indicator id → its own value format), the pre-query
// input resolveEffectiveFormat needs — the payload SHAPE changed for
// unmodified rows, which version hashes don't track, and a metric_info entry
// cached under "11" has no such field. And manifest schema v3 stamped the
// indicator catalog, making the manifest a code dimension these three caches
// key on.
// "13": the declared-format design (PLAN_EFFECTIVE_FORMAT). Manifest schema
// v4 rewrites metrics[].format_as in place under the SAME runId, and "12"
// entries (briefly live on testing deploys) hold payloads computed under the
// deleted inference design.
// "14": the PAE groupBy/value-prop collision fix (paeCollidingGroupBys) —
// configs disaggregated by a PAE ingredient previously had DuckDB bind the
// expression to the raw grouped value instead of the aggregate; cached "13"
// items hold those numbers.
// "15": project AA2 scope (PLAN_1_PROJECT_AA2_SCOPE) — payloads are computed
// under the project's scope and the keys gain a scopeToken segment; "14"
// entries were keyed without it.
const PO_CACHE_VERSION = "16";

// The immutable run id replaces the data-version dimensions (PLAN_RESULTS_RUNS
// §2.5): it is the uniqueness scope for these three data caches — two products
// resolving against the same package share entries — and the ONE cache
// dimension a package delete can sweep by prefix (delete_run.ts). The
// scopeToken rides beside it: payloads are computed under the caller's
// admin-area-2 scope (PLAN_PRODUCTS_RESTRUCTURE D7 — the caller supplies the
// (runId, adminArea2) pair its product carries), so two products share
// entries only when they share BOTH package and scope. Required on the
// uniqueness side so every exists/read site is forced to supply it (an
// optional would compile and silently mis-key); LEADING runId + TRAILING
// scopeToken so the `${runId}|`/`${runId}::` prefix scans and their
// roId-at-index-1 parses keep working.
export type PoDataVersionParams = {
  runId: string;
};

export const _PO_ITEMS_CACHE = new TimCacheC<
  {
    runId: string;
    resultsObjectId: string;
    fetchConfig: GenericLongFormFetchConfig;
    scopeToken: string;
  },
  PoDataVersionParams,
  APIResponseWithData<ItemsHolderPresentationObject>
>("po_items", {
  uniquenessHashFromParams: (params) =>
    [
      params.runId,
      params.resultsObjectId,
      hashFetchConfig(params.fetchConfig),
      params.scopeToken,
    ].join("|"),
  versionHashFromParams: () => PO_CACHE_VERSION,
  parseData: (res) => {
    if (
      res.success === false ||
      res.data.runId === undefined ||
      res.data.scopeToken === undefined
    ) {
      return {
        shouldStore: false,
        uniquenessHash: "",
        versionHash: "",
      };
    }
    return {
      shouldStore: true,
      uniquenessHash: [
        res.data.runId,
        res.data.resultsObjectId,
        hashFetchConfig(res.data.fetchConfig),
        res.data.scopeToken,
      ].join("|"),
      versionHash: PO_CACHE_VERSION,
    };
  },
});

export const _METRIC_INFO_CACHE = new TimCacheC<
  {
    runId: string;
    metricId: string;
    scopeToken: string;
  },
  PoDataVersionParams,
  APIResponseWithData<ResultsValueInfoForPresentationObject>
>("metric_info", {
  uniquenessHashFromParams: (params) =>
    [params.runId, params.metricId, params.scopeToken].join("::"),
  versionHashFromParams: () => PO_CACHE_VERSION,
  parseData: (res) => {
    // A transient possible-values failure is folded into a SUCCESSFUL payload
    // as a per-dimension `error` status; freezing it would pin the resolver's
    // "cannot enumerate" fallback until the next run. Serve it, never store it.
    if (
      res.success === false ||
      res.data.runId === undefined ||
      res.data.scopeToken === undefined ||
      Object.values(res.data.disaggregationPossibleValues).some(
        (s) => s.status === "error",
      )
    ) {
      return {
        shouldStore: false,
        uniquenessHash: "",
        versionHash: "",
      };
    }
    return {
      shouldStore: true,
      uniquenessHash: [
        res.data.runId,
        res.data.metricId,
        res.data.scopeToken,
      ].join("::"),
      versionHash: PO_CACHE_VERSION,
    };
  },
});

export const _REPLICANT_OPTIONS_CACHE = new TimCacheC<
  {
    runId: string;
    resultsObjectId: string;
    replicateBy: DisaggregationOption;
    fetchConfig: GenericLongFormFetchConfig;
    scopeToken: string;
  },
  PoDataVersionParams,
  APIResponseWithData<ReplicantOptionsForPresentationObject>
>("replicant_opts", {
  uniquenessHashFromParams: (params) => {
    return [
      params.runId,
      params.resultsObjectId,
      params.replicateBy,
      hashFetchConfig(params.fetchConfig),
      params.scopeToken,
    ].join("::");
  },
  versionHashFromParams: () => PO_CACHE_VERSION,
  parseData: (res) => {
    if (
      res.success === false ||
      res.data.runId === undefined ||
      res.data.scopeToken === undefined
    ) {
      return {
        shouldStore: false,
        uniquenessHash: "",
        versionHash: "",
      };
    }
    return {
      shouldStore: true,
      uniquenessHash: [
        res.data.runId,
        res.data.resultsObjectId,
        res.data.replicateBy,
        hashFetchConfig(res.data.fetchConfig),
        res.data.scopeToken,
      ].join("::"),
      versionHash: PO_CACHE_VERSION,
    };
  },
});
