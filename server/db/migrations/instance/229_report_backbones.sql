-- Report backbones (SYSTEM_12): a report style may carry a house style the AI
-- writes a report to, drafted from an example report and reviewed by a
-- person (lib/types/report_backbone.ts). Stored as JSON text beside the
-- style's palette; NULL on a palette-only style. backbone_source records what
-- it was drafted from: 'pdf', 'docx' or 'report'.

ALTER TABLE report_styles ADD COLUMN IF NOT EXISTS backbone text;
ALTER TABLE report_styles ADD COLUMN IF NOT EXISTS backbone_source text;
