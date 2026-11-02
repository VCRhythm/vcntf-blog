#!/usr/bin/env bash
# Deploy vcntf-blog: push code, trigger App Platform build.
# Guards: refuse pointless or misleading deploys.
set -euo pipefail

APP=73a495b5-1bd0-4627-84c9-b00899981228
BRANCH=main
cd "$(dirname "$0")"

# 1. Refuse to deploy with uncommitted work: `git push` only sends
#    commits, so dirty-tree files would silently miss the deploy.
if [[ -n "$(git status --porcelain)" ]]; then
    echo "⚠️  Uncommitted changes detected — they would NOT be deployed:" >&2
    git status --short >&2
    echo "" >&2
    echo "   Commit them first: git add ... && git commit -m \"...\"" >&2
    exit 1
fi

# 2. Check what's actually on the remote before deciding to deploy.
git fetch origin "$BRANCH"
local_sha="$(git rev-parse "$BRANCH")"
remote_sha="$(git rev-parse "origin/$BRANCH")"

# 3. Nothing new on main -> warn and skip the deploy entirely.
if [[ "$local_sha" == "$remote_sha" ]]; then
    echo "⚠️  No changes to deploy: $BRANCH matches origin/$BRANCH ($local_sha)."
    exit 0
fi

# 4. Local main must be strictly ahead of origin; otherwise the push
#    would fail (behind) or lose remote commits (diverged).
if [[ "$(git merge-base "$local_sha" "$remote_sha")" != "$remote_sha" ]]; then
    echo "⚠️  Local $BRANCH is behind (or diverged from) origin/$BRANCH:" >&2
    echo "   Pull first: git pull --rebase origin $BRANCH" >&2
    exit 1
fi

git push origin "$BRANCH"
doctl apps create-deployment "$APP" --wait
phase="$(doctl apps list-deployments "$APP" --format Phase --no-header | head -1)"
echo "Deployment phase: $phase"
echo "Live: https://vcntf-blog-4p8ws.ondigitalocean.app  (https://blog.vcntf.com once DNS is set)"
