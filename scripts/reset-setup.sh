#!/usr/bin/env bash
# Reset first-run state: deletes the persisted settings so the next launch
# shows the first-time setup wizard. Idempotent.
set -euo pipefail

settings="${XDG_CONFIG_HOME:-$HOME/.config}/xenia-linux-manager/settings.json"

if [ -f "$settings" ]; then
  rm "$settings"
  echo "reset: deleted $settings → next launch shows first-run wizard"
else
  echo "reset: no settings file at $settings → already at first-run defaults"
fi
