-- Every deck version now has its slide count (207, 208).

ALTER TABLE slide_deck_versions ALTER COLUMN slide_count SET NOT NULL;
