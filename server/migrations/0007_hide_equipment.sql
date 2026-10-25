-- Equipment is hidden (retired) rather than deleted, so old brews keep showing what they were made with
ALTER TABLE brewer ADD COLUMN hidden_at TEXT;
ALTER TABLE grinder ADD COLUMN hidden_at TEXT;
