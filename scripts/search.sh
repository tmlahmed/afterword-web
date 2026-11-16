#!/bin/sh
# Starts the Meilisearch search engine for local development, using the key in .env.
set -a
. ./.env
set +a
exec meilisearch \
  --db-path ./.meili/data \
  --dump-dir ./.meili/dumps \
  --snapshot-dir ./.meili/snapshots \
  --http-addr 127.0.0.1:7700 \
  --master-key "$MEILI_KEY" \
  --env development \
  --no-analytics
