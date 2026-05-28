ALTER TABLE share_tokens ADD COLUMN IF NOT EXISTS slug VARCHAR;
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_tokens_slug ON share_tokens(slug) WHERE slug IS NOT NULL;
