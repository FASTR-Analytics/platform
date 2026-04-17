UPDATE datasets
SET info = '{"_legacy": true}'
WHERE dataset_type = 'hfa' AND info = '{}';
