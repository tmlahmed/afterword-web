#!/bin/sh
# Back up the shop: the database and the uploaded images (covers, article pictures).
#
#   sh scripts/backup.sh
#
# Writes backups/afterword-YYYYMMDD-HHMM.dump and .media.tar.gz, keeps the newest 14 of each,
# and, if RCLONE_REMOTE is set (for example "b2:afterword-backups"), copies them off the server.
# Run it daily from cron; see docs/production.md.
set -eu
cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; . ./.env; set +a; }

: "${DATABASE_URL:?DATABASE_URL is not set}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
MEDIA_DIR="${MEDIA_DIR:-./media}"
KEEP="${BACKUP_KEEP:-14}"
STAMP="$(date +%Y%m%d-%H%M)"
mkdir -p "$BACKUP_DIR"

DB_FILE="$BACKUP_DIR/afterword-$STAMP.dump"
MEDIA_FILE="$BACKUP_DIR/afterword-$STAMP.media.tar.gz"

pg_dump --format=custom --no-owner --no-privileges --file="$DB_FILE" "$DATABASE_URL"
if [ -d "$MEDIA_DIR" ]; then
  tar -czf "$MEDIA_FILE" -C "$(dirname "$MEDIA_DIR")" "$(basename "$MEDIA_DIR")"
fi

# A backup that cannot be read is not a backup: list its contents as a check.
pg_restore --list "$DB_FILE" > /dev/null

# Keep the newest $KEEP of each kind.
ls -1t "$BACKUP_DIR"/afterword-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs rm -f
ls -1t "$BACKUP_DIR"/afterword-*.media.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs rm -f

if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$DB_FILE" "$RCLONE_REMOTE"
  [ -f "$MEDIA_FILE" ] && rclone copy "$MEDIA_FILE" "$RCLONE_REMOTE"
fi

echo "Backed up to $DB_FILE ($(du -h "$DB_FILE" | cut -f1))${RCLONE_REMOTE:+ and copied to $RCLONE_REMOTE}"
