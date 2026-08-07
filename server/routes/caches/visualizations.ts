import {
  type APIResponseWithData,
  type DisaggregationOption,
  type GenericLongFormFetchConfig,
  hashFetchConfig,
  type ItemsHolderPresentationObject,
  type PresentationObjectDetail,
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
const PO_CACHE_VERSION = "13";

// The immutable run id replaces the data-version dimensions (PLAN_RESULTS_RUNS
// §2.5): it is the uniqueness scope for the three data caches — two projects
// attached to the same run share entries — and is folded into po_detail's
// version (its payload embeds run-derived resultsValue). Payloads missing a
// runId (the parity rig's Postgres baseline) are never stored.
export type PoDataVersionParams = {
  runId: string;
};

export const _PO_DETAIL_CACHE = new TimCacheC<
  {
    projectId: string;
    presentationObjectId: string;
  },
  {
    presentationObjectLastUpdated: string;
    runId: string;
  },
  APIResponseWithData<PresentationObjectDetail>
  // Prefix is versioned: bump it whenever the cached payload SHAPE or
  // SOURCING changes (the version hash only tracks the row's last_updated +
  // runId, so a deploy that adds a field or re-sources the payload would
  // otherwise keep serving old entries for unmodified rows). v2: resultsValue
  // gained hasFacilityLevelRows. v3 was minted twice on divergent branches
  // (main: resultsValue.datasetFamily; results-runs: manifest sourcing), so
  // the merge takes v4: both of those at once. v5: the post-merge semantic
  // batch populated datasetFamily on the RUN path after v4 was minted —
  // v4 entries from that window lack the field. v6: manifest schema v3 — this
  // cache carries no code dimension, and a transform rewrites a manifest in
  // place under the SAME runId, so the prefix is the only thing that can
  // retire entries sourced from the pre-transform manifest. v7: manifest
  // schema v4 (declared format) — payloads embed resultsValue.formatAs, which
  // the v4 rewrite flips for the 8 pre-declaration metrics.
>("po_detail_v7", {
  uniquenessHashFromParams: (params) =>
    [params.projectId, params.presentationObjectId].join("|"),
  versionHashFromParams: (params) =>
    `${params.presentationObjectLastUpdated}|${params.runId}`,
  parseData: (res) => {
    if (res.success === false || res.data.runId === undefined) {
      return {
        shouldStore: false,
        uniquenessHash: "",
        versionHash: "",
      };
    }
    return {
      shouldStore: true,
      uniquenessHash: [res.data.projectId, res.data.id].join("|"),
      versionHash: `${res.data.lastUpdated}|${res.data.runId}`,
    };
  },
});

export const _PO_ITEMS_CACHE = new TimCacheC<
  {
    runId: string;
    resultsObjectId: string;
    fetchConfig: GenericLongFormFetchConfig;
  },
  PoDataVersionParams,
  APIResponseWithData<ItemsHolderPresentationObject>
>("po_items", {
  uniquenessHashFromParams: (params) =>
    [
      params.runId,
      params.resultsObjectId,
      hashFetchConfig(params.fetchConfig),
    ].join("|"),
  versionHashFromParams: () => PO_CACHE_VERSION,
  parseData: (res) => {
    if (res.success === false || res.data.runId === undefined) {
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
      ].join("|"),
      versionHash: PO_CACHE_VERSION,
    };
  },
});

export const _METRIC_INFO_CACHE = new TimCacheC<
  {
    runId: string;
    metricId: string;
  },
  PoDataVersionParams,
  APIResponseWithData<ResultsValueInfoForPresentationObject>
>("metric_info", {
  uniquenessHashFromParams: (params) =>
    [params.runId, params.metricId].join("::"),
  versionHashFromParams: () => PO_CACHE_VERSION,
  parseData: (res) => {
    // A transient possible-values failure is folded into a SUCCESSFUL payload
    // as a per-dimension `error` status; freezing it would pin the resolver's
    // "cannot enumerate" fallback until the next run. Serve it, never store it.
    if (
      res.success === false ||
      res.data.runId === undefined ||
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
      uniquenessHash: [res.data.runId, res.data.metricId].join("::"),
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
    ].join("::");
  },
  versionHashFromParams: () => PO_CACHE_VERSION,
  parseData: (res) => {
    if (res.success === false || res.data.runId === undefined) {
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
      ].join("::"),
      versionHash: PO_CACHE_VERSION,
    };
  },
});
