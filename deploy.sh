#!/usr/bin/env bash
# Deploy vcntf-blog: push code, trigger App Platform build.
set -euo pipefail
APP=73a495b5-1bd0-4627-84c9-b00899981228
cd "$(dirname "$0")/.."
rm -f deploy.lock
git push origin main
doctl apps create-deployment "$APP" --wait
phase=$(doctl apps list-deployments "$APP" --format Phase --no-header | head -1)
echo "Deployment phase: $phase"
echo "Live: https://vcntf-blog-4p8ws.ondigitalocean.app  (https://blog.vcntf.com once DNS is set)"