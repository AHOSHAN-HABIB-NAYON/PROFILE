#!/usr/bin/env bash
# Consistent MySQL backup (InnoDB, no table locks) + private storage directory.
# Usage: scripts/backup.sh /path/to/backups   (cron: 15 * * * * /opt/tradeteam/scripts/backup.sh /backups)
set -euo pipefail
DEST="${1:-./backups}"
STORAGE="${STORAGE_DIR:-$(dirname "$0")/../storage}"
ENV_FILE="$STORAGE/runtime.env"
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a
: "${DB_NAME:?DB_NAME not set}"; : "${DB_USER:?DB_USER not set}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DEST"
umask 077
MYSQL_PWD="${DB_PASSWORD:-}" mysqldump --single-transaction --quick --routines --triggers --hex-blob \
  -h "${DB_HOST:-127.0.0.1}" -P "${DB_PORT:-3306}" -u "$DB_USER" "$DB_NAME" | gzip -9 > "$DEST/db-$STAMP.sql.gz"
tar -czf "$DEST/storage-$STAMP.tar.gz" -C "$STORAGE" .
# Keep 14 days locally; ship $DEST to off-site, encrypted storage as well.
find "$DEST" -type f -mtime +14 -delete
echo "backup complete: $DEST/*-$STAMP.*"
