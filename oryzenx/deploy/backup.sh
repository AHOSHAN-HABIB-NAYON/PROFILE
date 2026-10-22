#!/usr/bin/env bash
# Daily MySQL backup, keeps 14 days. Add to crontab (crontab -e):
#   15 3 * * * /home/oryzenx/app/oryzenx/deploy/backup.sh >> /home/oryzenx/backup.log 2>&1
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
set -a; source "$DIR/server/.env"; set +a
OUT="$DIR/server/backups"
mkdir -p "$OUT"
FILE="$OUT/oryzenx-$(date +%F-%H%M).sql.gz"
MYSQL_PWD="$DB_PASSWORD" mysqldump -h "${DB_HOST:-127.0.0.1}" -u "$DB_USER" --single-transaction --routines "$DB_NAME" | gzip > "$FILE"
# Uploaded photos and logos too.
tar -czf "$OUT/uploads-$(date +%F).tar.gz" -C "$DIR/server" uploads 2>/dev/null || true
find "$OUT" -type f -mtime +14 -delete
echo "$(date) backup ok: $FILE"
