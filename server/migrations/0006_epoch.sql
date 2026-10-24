-- M4: database epoch. A restore gives the database a new epoch; devices that synced with the old one
-- send back what they have and pull everything again (their cursor and data may be ahead of the backup).
INSERT INTO meta (key, value) VALUES ('epoch', abs(random()));
