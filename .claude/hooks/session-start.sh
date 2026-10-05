#!/bin/bash
# Installs npm dependencies in the background so Claude Code cloud sessions start
# immediately. Progress: /tmp/session-start-npm-install.log. Completion marker:
# node_modules/.session-install-done (AGENTS.md tells agents to wait on it).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo '{"async": true, "asyncTimeout": 300000}'

cd "$CLAUDE_PROJECT_DIR"
rm -f node_modules/.session-install-done
npm install --no-audit --no-fund > /tmp/session-start-npm-install.log 2>&1
touch node_modules/.session-install-done
