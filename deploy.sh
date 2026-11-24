#!/bin/sh
# Jedním příkazem: ověř data a nasaď na Cloudflare Pages.
set -e
cd "$(dirname "$0")"
python3 scripts/validate-rodokmen.py
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "Chybí CLOUDFLARE_API_TOKEN (oprávnění Cloudflare Pages: Edit)." >&2
  exit 2
fi

# Wrangler ukládá cache vedle své instalace. Systémové /node_modules často
# není zapisovatelné, proto používáme instalaci v domovském adresáři.
WRANGLER_DIR="${WRANGLER_DIR:-$HOME/.cache/rodokmen-wrangler}"
if [ ! -x "$WRANGLER_DIR/node_modules/.bin/wrangler" ]; then
  mkdir -p "$WRANGLER_DIR"
  (cd "$WRANGLER_DIR" && npm init -y >/dev/null 2>&1 && npm install wrangler@4 --no-fund --no-audit)
fi

ACCOUNT_ARG=""
if [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  ACCOUNT_ARG="--account-id ${CLOUDFLARE_ACCOUNT_ID}"
fi

# shellcheck disable=SC2086
exec "$WRANGLER_DIR/node_modules/.bin/wrangler" pages deploy . --project-name=rodokmen-jirman $ACCOUNT_ARG
