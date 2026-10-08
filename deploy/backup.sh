#!/usr/bin/env bash
# Backs up PostgreSQL and MongoDB from the running Compose stack into ~/yieldsense/backups and keeps
# the last 14. Schedule it daily with cron:
#   0 2 * * * cd ~/yieldsense && bash deploy/backup.sh >> backups/backup.log 2>&1
#
# Restore:
#   gunzip -c backups/<stamp>-postgres.sql.gz | docker compose exec -T postgres psql -U yieldsense -d yieldsense
#   docker compose exec -T mongo mongorestore --archive --gzip --drop < backups/<stamp>-mongo.archive.gz
set -euo pipefail
cd "$(dirname "$0")/.."
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p backups
compose="docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.prod.yml"

$compose exec -T postgres pg_dump -U yieldsense -d yieldsense --no-owner | gzip > "backups/${stamp}-postgres.sql.gz"
$compose exec -T mongo mongodump --db yieldsense --archive --gzip > "backups/${stamp}-mongo.archive.gz"

ls -1t backups/*-postgres.sql.gz | tail -n +15 | xargs -r rm -f
ls -1t backups/*-mongo.archive.gz | tail -n +15 | xargs -r rm -f
echo "backup ${stamp} done: $(du -ch backups/${stamp}-* | tail -1 | cut -f1)"
