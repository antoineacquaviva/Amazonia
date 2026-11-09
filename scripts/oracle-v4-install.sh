#!/usr/bin/env bash
# Run the verified kit's Python installer; no sudo or active service changes.
set -euo pipefail
exec python3 "$(dirname -- "$0")/oracle-v4-install.py"
