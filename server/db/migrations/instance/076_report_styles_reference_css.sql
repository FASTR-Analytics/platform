-- Custom report styles: carry the source report's actual <style> CSS verbatim
-- (reference_css). The distilled prose brief alone proved lossy — an AI
-- regenerating CSS from prose never matches the original report's look; the
-- reference stylesheet is injected into the authoring instructions to REUSE.

ALTER TABLE report_styles ADD COLUMN IF NOT EXISTS reference_css text;
