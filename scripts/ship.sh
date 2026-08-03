#!/usr/bin/env bash
# Ship: push → watch the RIGHT run → verify against a cache-busted origin.
#
# Exists because ad-hoc shipping produced three false alarms in a row, all
# infrastructure, none real:
#   1. `gh run list --limit 1` immediately after push races GitHub and watches
#      the PREVIOUS run — "DEPLOY OK" against a stale deployment.
#   2. GitHub Pages fronts everything with a ~600s CDN cache; testing the plain
#      URL inside that window reports the old build.
#   3. Headless-probe browser profiles keep their own HTTP cache with the same
#      TTL — a fresh profile is part of a fresh test.
#
# Usage: bash scripts/ship.sh   (after committing)
set -euo pipefail

REPO="officialtellergram/tour-archive"
BASE="https://officialtellergram.github.io/tour-archive"
export PATH="$PATH:/c/Program Files/GitHub CLI"
export GH_TOKEN="${GH_TOKEN:-$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | grep '^password=' | cut -d= -f2)}"

SHA=$(git rev-parse HEAD)
git push

# Wait for the run that belongs to THIS commit — not merely the newest run.
echo "waiting for CI run for ${SHA:0:9}…"
RUN=""
for _ in $(seq 1 40); do
  RUN=$(gh run list --repo "$REPO" --commit "$SHA" --limit 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)
  [ -n "$RUN" ] && break
  sleep 3
done
[ -n "$RUN" ] || { echo "✖ no CI run appeared for $SHA"; exit 1; }

gh run watch "$RUN" --repo "$REPO" --exit-status >/dev/null && echo "✔ deploy green (run $RUN)" || { echo "✖ deploy failed"; exit 1; }

# Origin verification with a unique query — bypasses the CDN window entirely.
# PYTHONIOENCODING: the Windows console is cp1252 and chokes on unicode marks.
BUST=$(date +%s)
curl -s "$BASE/api/inventory.json?v=$BUST" | PYTHONIOENCODING=utf-8 python -c "
import json,sys
d=json.load(sys.stdin)
photos=sum(1 for i in d['items'] if i.get('photo'))
print('OK origin snapshot:', d['counts']['total'], 'items /', photos, 'with photos /', d['counts']['syndicated'], 'syndicated')
"
echo "note: plain URLs (and open browser tabs) lag up to 10 min behind — that is the CDN, not the deploy."
