-- Application statement responses allow 4 MiB canonical JSON. PostgreSQL's
-- jsonb text includes additional whitespace; keep storage bounded at 6 MiB.
-- Other command responses retain the original 64 KiB database safeguard.
ALTER TABLE command_replays DROP CONSTRAINT ck_command_replays_body_size;
ALTER TABLE command_replays ADD CONSTRAINT ck_command_replays_body_size CHECK (
 octet_length(response_body::text) <= CASE
 WHEN request_method='POST' AND canonical_path ~ '^/api/v1/statements(/[0-9a-f-]{36}/(regenerate|submit|approvals|publish))?$'
 THEN 6291456 ELSE 65536 END
);
