#!/bin/sh
# Restore the shop from a backup made by backup.sh. This REPLACES the database it is pointed at.
#
#   sh scripts/restore.sh backups/afterword-20261116-0300.dump [--yes]
#
# Restores into DATABASE_URL (from .env unless set). The matching .media.tar.gz, if present,
# is unpacked into MEDIA_DIR. Stop the shop first, restore, then start it and run
# `pnpm search:reindex`.
set -eu
cd "$(dirname "$0")/.."
DUMP="${1:?Give the .dump file to restore}"
CONFIRM="${2:-}"
[ -f .env ] && [ -z "${DATABASE_URL:-}" ] && { set -a; . ./.env; set +a; }
: "${DATABASE_URL:?DATABASE_URL is not set}"
MEDIA_DIR="${MEDIA_DIR:-./media}"

if [ "$CONFIRM" != "--yes" ]; then
  echo "This will replace everything in $DATABASE_URL with $DUMP."
  printf "Type RESTORE to continue: "
  read -r answer
  [ "$answer" = "RESTORE" ] || { echo "Stopped. Nothing was changed."; exit 1; }
fi

pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --dbname="$DATABASE_URL" "$DUMP"

MEDIA="${DUMP%.dump}.media.tar.gz"
if [ -f "$MEDIA" ]; then
  mkdir -p "$MEDIA_DIR"
  tar -xzf "$MEDIA" -C "$(dirname "$MEDIA_DIR")"
fi
echo "Restored $DUMP. Now start the shop and run: pnpm search:reindex"
