#!/usr/bin/env bash
# Prints `export <SERVICE>_GIT_COMMIT=<short-sha>` for each repo's current HEAD, so that
# `docker compose build` stamps the right commit into every image.
#
# Usage (from the gateway directory):
#   eval "$(scripts/git-commits.sh)" && docker compose up -d --build
#
# A repo that is missing or not a git checkout gets "unknown".
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

emit() {
  local var="$1" dir="$2" sha
  sha="$(git -C "$root/$dir" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  printf 'export %s=%s\n' "$var" "$sha"
}

emit GATEWAY_GIT_COMMIT .
emit USER_GIT_COMMIT ../user
emit TUTOR_GIT_COMMIT ../tutor
emit THIRD_GIT_COMMIT ../third
emit UI_GIT_COMMIT ../ui
