-- ============================================================================
-- Migration: Add indexes to optimize cache warming queries for datasets
-- ============================================================================

-- Dataset HMIS queries during cache warming:
-- 1. SELECT id FROM dataset_hmis_versions ORDER BY id DESC LIMIT 1
--    Uses PK for ordering - already optimal

-- 2. SELECT updated_at FROM indicator_mappings ORDER BY updated_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_indicator_mappings_updated_at
ON indicator_mappings(updated_at DESC);

-- 3. SELECT admin_area_2 FROM admin_areas_2 ORDER BY LOWER(admin_area_2)
--    Full table scan acceptable for small reference table

-- 4. SELECT DISTINCT facility_type FROM facilities WHERE facility_type IS NOT NULL ORDER BY facility_type
CREATE INDEX IF NOT EXISTS idx_facilities_facility_type
ON facilities(facility_type) WHERE facility_type IS NOT NULL;

-- 5. SELECT DISTINCT facility_ownership FROM facilities WHERE facility_ownership IS NOT NULL ORDER BY facility_ownership
CREATE INDEX IF NOT EXISTS idx_facilities_facility_ownership
ON facilities(facility_ownership) WHERE facility_ownership IS NOT NULL;

-- 6. Heavy query: SELECT COUNT(*) AS count, SUM(count) AS sum, indicator_raw_id, period_id FROM dataset_hmis GROUP BY indicator_raw_id, period_id
--    Already has indexes: idx_dataset_hmis_indicator_period (covers this perfectly)
--    This is optimal for GROUP BY (indicator_raw_id, period_id)

-- 7. Heavy query: SELECT DISTINCT indicator_raw_id FROM dataset_hmis
--    Uses idx_dataset_hmis_indicator_id

-- 8. JOIN query: dataset_hmis with indicator_mappings on indicator_raw_id
--    Already indexed: idx_indicator_mappings_raw_id

-- 9. Aggregation with JOIN for common indicators:
--    SELECT facility_id, indicator_common_id, period_id, SUM(dh.count)
--    FROM dataset_hmis dh
--    INNER JOIN indicator_mappings im ON dh.indicator_raw_id = im.indicator_raw_id
--    GROUP BY facility_id, im.indicator_common_id, period_id
--
--    This benefits from a composite index on (indicator_raw_id, indicator_common_id)
--    to speed up the JOIN and GROUP BY
CREATE INDEX IF NOT EXISTS idx_indicator_mappings_raw_common
ON indicator_mappings(indicator_raw_id, indicator_common_id);

-- 10. Period bounds query: SELECT MIN(period_id), MAX(period_id) FROM dataset_hmis
--     Uses idx_dataset_hmis_period_indicator (period_id is first column in some composite indexes)
--     Add dedicated index for MIN/MAX queries
CREATE INDEX IF NOT EXISTS idx_dataset_hmis_period_id
ON dataset_hmis(period_id);

-- Dataset HFA queries:
-- 11. SELECT id FROM dataset_hfa_versions ORDER BY id DESC LIMIT 1
--     Uses PK - already optimal

-- 12. Heavy query: SELECT var_name, facility_id, time_point, value FROM dataset_hfa
--     Already has: idx_dataset_hfa_var_name, idx_dataset_hfa_facility_id
--     For SELECT with all these columns, a covering index would help
CREATE INDEX IF NOT EXISTS idx_dataset_hfa_covering
ON dataset_hfa(var_name, facility_id, time_point)
INCLUDE (value);
