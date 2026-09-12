-- The dictionary stamps (PLAN_A4 ruling 13): the HMIS dataset's captured
-- `info` JSON carries `indicatorsVersion` and `baseIndicatorsVersion`, the
-- names the instance summary and the SSE payload use, instead of the
-- `…MappingsVersion` pair. Read by cast, not by a Zod sweep, so this rewrite
-- is the whole transform. Matches no row on a fresh install or a second run.

UPDATE datasets
SET info = (
  (info::jsonb - 'indicatorMappingsVersion' - 'baseIndicatorMappingsVersion')
  || CASE WHEN info::jsonb ? 'indicatorMappingsVersion'
       THEN jsonb_build_object('indicatorsVersion', info::jsonb -> 'indicatorMappingsVersion')
       ELSE '{}'::jsonb END
  || CASE WHEN info::jsonb ? 'baseIndicatorMappingsVersion'
       THEN jsonb_build_object('baseIndicatorsVersion', info::jsonb -> 'baseIndicatorMappingsVersion')
       ELSE '{}'::jsonb END
)::text
WHERE jsonb_typeof(info::jsonb) = 'object'
  AND (info::jsonb ? 'indicatorMappingsVersion' OR info::jsonb ? 'baseIndicatorMappingsVersion');
