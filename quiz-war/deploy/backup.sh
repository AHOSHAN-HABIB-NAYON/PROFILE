#!/bin/sh
# Daily logical backup of the QUIZ WAR database (run by the `backup` compose service).
# Copy /backups off-site (S3/B2/another server) — see docs/backup.md.
set -eu
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT=/backups/quizwar-$TS.sql.gz
mysqldump -h mysql -u root --single-transaction --quick --routines --triggers --set-gtid-purged=OFF quizwar | gzip -9 > "$OUT.tmp"
mv "$OUT.tmp" "$OUT"
find /backups -name 'quizwar-*.sql.gz' -mtime +"${RETENTION_DAYS:-14}" -delete
echo "backup written: $OUT"
