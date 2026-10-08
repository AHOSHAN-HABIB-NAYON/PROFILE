# Backup & restore

## What to back up
| Item | How | Frequency | Retention |
|---|---|---|---|
| MySQL database | `deploy/backup.sh` (`mysqldump --single-transaction`, gzip) via the `backup` compose service, or managed-DB snapshots | daily (+ binlog/PITR if your provider offers it) | 14 daily (`BACKUP_RETENTION_DAYS`), plus 8 weekly and 6 monthly off-site copies |
| Uploaded media (`uploads` volume or S3 bucket) | `rsync`/bucket versioning | daily | 30 days |
| Production environment variables | store in a password manager / secret manager (not in git) | on every change | keep previous version |
| Android upload keystore + passwords | see [android-release.md](android-release.md#release-signing--keep-the-upload-key-safe) | once (on creation) | forever, ≥ 2 independent copies |
| `google-services.json`, FCM service account | password manager | on change | keep previous |

Copy `/backups` off the server (e.g. `aws s3 sync`/`rclone` to an encrypted bucket in another region)
— a backup on the same disk is not a backup.

## Restore the database
```bash
# 1. Stop the API (avoid writes)
docker compose stop api
# 2. Restore into a fresh database
gunzip -c quizwar-20261008T020000Z.sql.gz | docker compose exec -T mysql sh -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" quizwar'
# 3. Start the API — migrations run automatically and are no-ops on an up-to-date schema
docker compose start api
```
Live matches in memory at the time of the incident are lost (players see "match ended"); all
completed matches, rewards and ratings are in the database.

## Test restores
Once a month restore the latest backup into a **separate staging database**, start a staging API
against it and sign in / open the Admin dashboard. (Do not point `TEST_DATABASE_URL` at it — the test
suite wipes its database.) An untested backup should be treated as missing.
