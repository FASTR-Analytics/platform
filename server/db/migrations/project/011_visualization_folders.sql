-- Create visualization_folders table
CREATE TABLE IF NOT EXISTS visualization_folders (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  last_updated TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visualization_folders_sort_order ON visualization_folders(sort_order);
CREATE INDEX IF NOT EXISTS idx_visualization_folders_last_updated ON visualization_folders(last_updated);

-- Add folder_id column to presentation_objects
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'presentation_objects'
    AND column_name = 'folder_id'
  ) THEN
    ALTER TABLE presentation_objects ADD COLUMN folder_id TEXT REFERENCES visualization_folders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add sort_order column to presentation_objects
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'presentation_objects'
    AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE presentation_objects ADD COLUMN sort_order INTEGER DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_presentation_objects_folder_id ON presentation_objects(folder_id);
CREATE INDEX IF NOT EXISTS idx_presentation_objects_sort_order ON presentation_objects(sort_order);
