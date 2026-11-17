#!/bin/sh
# Start the shop for development: the search engine (if installed and not already running),
# then the Next.js dev server. Stopping the dev server stops the search engine it started.
cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; . ./.env; set +a; }

started=""
if command -v meilisearch >/dev/null 2>&1 && ! curl -s -m 2 "${MEILI_URL:-http://127.0.0.1:7700}/health" >/dev/null 2>&1; then
  mkdir -p .meili
  sh scripts/search.sh > .meili/search.log 2>&1 &
  started=$!
  echo "Started the search engine (log: .meili/search.log)"
fi
cleanup() { [ -n "$started" ] && kill "$started" 2>/dev/null; }
trap cleanup EXIT INT TERM

NODE_OPTIONS=--no-deprecation npx next dev "$@"
