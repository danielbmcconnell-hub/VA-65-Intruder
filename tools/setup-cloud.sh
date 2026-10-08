#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")/.."
npm ci --ignore-scripts --cache /tmp/intruder-npm-cache
python3 -m venv .venv
.venv/bin/python -m pip install --disable-pip-version-check --cache-dir /tmp/intruder-pip-cache -r requirements-dev.txt
.venv/bin/python tests/check-atlases.py
printf '%s\n' 'Setup complete. Activate .venv before npm run test:assets; npm test starts its own browser/server.'
