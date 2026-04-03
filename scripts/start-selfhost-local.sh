#!/usr/bin/env bash
set -euo pipefail

cd /app

mkdir -p /app/.convex
if [ ! -d /app/.convex/local/default ]; then
  cp -R /app/.convex-seed/local /app/.convex/local
fi

exec npx convex dev --typecheck=disable --run-sh "HOST=${HOST:-0.0.0.0} PORT=${PORT:-8081} node .output/server/index.mjs"
