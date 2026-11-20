#!/bin/sh
# Show the development site to friends through a Cloudflare quick tunnel:  pnpm share
# Gives a random https://….trycloudflare.com address that works while this runs and the
# development server (pnpm dev) is running. Press Ctrl+C to stop sharing.
PORT="${PORT:-3000}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed. Install it with:  brew install cloudflared"
  exit 1
fi
if ! curl -s -o /dev/null "http://localhost:$PORT"; then
  echo "Nothing is running on http://localhost:$PORT. Start the shop first with:  pnpm dev"
  exit 1
fi

echo "Sharing http://localhost:$PORT. Look for the https://….trycloudflare.com address below."
echo "Anyone with that address can see the site. Press Ctrl+C to stop."
exec cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT"
