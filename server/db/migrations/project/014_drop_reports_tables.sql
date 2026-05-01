-- Drop legacy reports tables (replaced by slide_decks)
-- report_items depends on reports via foreign key, so drop it first

DROP TABLE IF EXISTS report_items;
DROP TABLE IF EXISTS reports;
