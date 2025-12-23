-- Add latest_ran_commit_sha column to track the commit SHA from the last time the module was run
ALTER TABLE modules ADD COLUMN latest_ran_commit_sha text;
