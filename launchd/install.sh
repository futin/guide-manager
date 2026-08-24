#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
PLIST="$HOME/Library/LaunchAgents/com.guide-manager.plist"

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

sed -e "s|__NODE__|$NODE|g" \
    -e "s|__ROOT__|$ROOT|g" \
    -e "s|__HOME__|$HOME|g" \
    "$ROOT/launchd/com.guide-manager.plist.template" > "$PLIST"

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "guide-manager LaunchAgent loaded."
echo "logs: $HOME/Library/Logs/guide-manager.log"
if command -v tailscale >/dev/null 2>&1; then
  echo "phone URL: http://$(tailscale ip -4 2>/dev/null | head -1):4321"
else
  echo "phone URL: http://<this-mac's-tailscale-name>:4321"
fi
