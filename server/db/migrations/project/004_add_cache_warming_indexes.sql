-- ============================================================================
-- Migration: Add indexes to optimize cache warming queries
-- ============================================================================

-- presentation_objects table
-- Already has: idx_presentation_objects_module_id, idx_presentation_objects_results_object_id, idx_presentation_objects_last_updated
-- Cache warming queries:
-- 1. SELECT id, label, module_id FROM presentation_objects (full table scan during warmup - acceptable)
-- 2. SELECT module_id, last_updated FROM presentation_objects WHERE id = ? (uses PK)
-- These are well-indexed already

-- modules table
-- Already has: idx_modules_last_updated, idx_modules_last_run, idx_modules_dirty
-- Cache warming queries:
-- 1. SELECT last_run FROM modules WHERE id = ? (uses PK)
-- Well-indexed already

-- results_values table
-- Already has: idx_results_values_results_object_id, idx_results_values_module_id
-- No direct queries in cache warming, used via joins - well-indexed

-- No additional indexes needed for project database cache warming queries
-- All critical lookups use primary keys or existing indexes
