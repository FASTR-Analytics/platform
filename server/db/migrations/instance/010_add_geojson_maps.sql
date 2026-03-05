CREATE TABLE IF NOT EXISTS geojson_maps (
  admin_area_level integer PRIMARY KEY CHECK (admin_area_level IN (2, 3, 4)),
  geojson text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
