#!/usr/bin/env bash
set -euo pipefail

ENDPOINT="${MTX_ENDPOINT:-http://127.0.0.1:8787}"
TMP_HOME="$(mktemp -d -t mtx-smoke-XXXXXX)"
TMP_PROJ="$(mktemp -d -t mtx-proj-XXXXXX)"
trap 'rm -rf "$TMP_HOME" "$TMP_PROJ"' EXIT

export MTX_HOME="$TMP_HOME"
export MTX_ENDPOINT="$ENDPOINT"

ROOT="$(cd "$(dirname "$0")"/.. && pwd)"
MTX="$ROOT/packages/mtx-cli/bin/mtx.mjs"

echo "[smoke] endpoint     : $ENDPOINT"
echo "[smoke] mtx home     : $TMP_HOME"
echo "[smoke] project dir  : $TMP_PROJ"

echo "[smoke] checking worker liveness..."
if ! curl -fsS "$ENDPOINT/healthz" >/dev/null; then
  echo "[smoke] worker not responding at $ENDPOINT"
  exit 1
fi

echo "[smoke] starting device flow..."
device=$(curl -fsS -X POST "$ENDPOINT/v1/auth/device/start")
device_code=$(printf '%s' "$device" | sed -n 's/.*"deviceCode":"\([^"]*\)".*/\1/p')
if [ -z "$device_code" ]; then
  echo "[smoke] failed to extract deviceCode from: $device"
  exit 1
fi
echo "[smoke] device code  : $device_code"

echo "[smoke] dev-authorizing..."
curl -fsS -X POST "$ENDPOINT/v1/auth/device/dev-authorize" \
  -H 'content-type: application/json' \
  -d "{\"deviceCode\":\"$device_code\",\"githubLogin\":\"smoke-tester\"}" >/dev/null

poll=$(curl -fsS -X POST "$ENDPOINT/v1/auth/device/poll" \
  -H 'content-type: application/json' \
  -d "{\"deviceCode\":\"$device_code\"}")
api_key=$(printf '%s' "$poll" | sed -n 's/.*"apiKey":"\([^"]*\)".*/\1/p')
author_id=$(printf '%s' "$poll" | sed -n 's/.*"authorId":"\([^"]*\)".*/\1/p')
if [ -z "$api_key" ]; then
  echo "[smoke] failed to extract apiKey from: $poll"
  exit 1
fi

mkdir -p "$TMP_HOME"
cat > "$TMP_HOME/config.json" <<EOF
{
  "endpoint": "$ENDPOINT",
  "authorId": "$author_id",
  "apiKey": "$api_key",
  "githubLogin": "smoke-tester"
}
EOF
chmod 600 "$TMP_HOME/config.json"
echo "[smoke] login        : $author_id"

echo "[smoke] mtx keygen..."
node "$MTX" keygen --name smoke 2>&1 | sed 's/^/  /'

active_key=$(grep -o '"activeKeyId"[^"]*"[^"]*"' "$TMP_HOME/config.json" | sed 's/.*"\([^"]*\)"$/\1/')
echo "[smoke] keyId        : $active_key"

echo "[smoke] scaffolding extension..."
mkdir -p "$TMP_PROJ/dist"
cat > "$TMP_PROJ/package.json" <<EOF
{
  "name": "mterminal-plugin-smoke-demo",
  "version": "0.1.0",
  "main": "dist/main.cjs",
  "description": "smoke",
  "engines": { "mterminal-api": "^1.0.0" },
  "mterminal": {
    "id": "smoke-demo",
    "displayName": "smoke demo",
    "category": "other",
    "publisher": { "authorId": "$author_id", "keyId": "$active_key" },
    "activationEvents": ["onStartupFinished"],
    "capabilities": ["clipboard"],
    "contributes": {}
  }
}
EOF
cat > "$TMP_PROJ/dist/main.cjs" <<'EOF'
module.exports = { activate(){}, deactivate(){} }
EOF
cat > "$TMP_PROJ/README.md" <<EOF
# smoke-demo
EOF

echo "[smoke] mtx pack..."
( cd "$TMP_PROJ" && node "$MTX" pack --no-build 2>&1 ) | sed 's/^/  /'

mtx_file=$(ls "$TMP_PROJ"/*.mtx | head -1)
echo "[smoke] artifact     : $(basename "$mtx_file") ($(wc -c < "$mtx_file") bytes)"

echo "[smoke] mtx publish..."
( cd "$TMP_PROJ" && node "$MTX" publish --file "$mtx_file" 2>&1 ) | sed 's/^/  /'

echo "[smoke] verifying via search..."
search=$(curl -fsS "$ENDPOINT/v1/extensions?q=smoke")
if printf '%s' "$search" | grep -q 'smoke-demo'; then
  echo "[smoke] search found smoke-demo"
else
  echo "[smoke] search did not return smoke-demo: $search"
  exit 1
fi

echo "[smoke] done."
