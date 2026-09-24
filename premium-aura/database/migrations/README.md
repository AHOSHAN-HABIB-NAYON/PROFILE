# Migrations

Place incremental `NNNN_description.sql` files here. On boot (and via
`npm run migrate`) any file not yet recorded in `schema_migrations` is applied
in filename order, after `schema.sql` (which is idempotent).
