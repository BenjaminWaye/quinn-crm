#!/usr/bin/env bash
set -euo pipefail
# Run from workspace root
WORKSPACE_ROOT="$(pwd)"
. "$WORKSPACE_ROOT/quinn-crm/functions/.env"
DATE=$(date +%F)
TMP1="sync_memory_${DATE}.md"
TMP2="sync_activity_${DATE}-heartbeat.md"
# Copy if present
[ -f "$WORKSPACE_ROOT/memory/${DATE}.md" ] && cp "$WORKSPACE_ROOT/memory/${DATE}.md" "$WORKSPACE_ROOT/$TMP1" || true
[ -f "$WORKSPACE_ROOT/activity_notes/${DATE}-heartbeat.md" ] && cp "$WORKSPACE_ROOT/activity_notes/${DATE}-heartbeat.md" "$WORKSPACE_ROOT/$TMP2" || true
# Build files arg (always include the primary docs too)
FILES=("README-front.md" "README-backend.md" "AGENTS.md" "USER.md")
[ -f "$WORKSPACE_ROOT/$TMP1" ] && FILES+=("$TMP1")
[ -f "$WORKSPACE_ROOT/$TMP2" ] && FILES+=("$TMP2")
FILES_ARG="$(IFS=,; echo "${FILES[*]}")"
# Run sync-docs
node quinn-crm/scripts/dashboard-relay.mjs sync-docs --files="$FILES_ARG"
# Run the auto-worker
node quinn-crm/scripts/dashboard-relay.mjs poll-and-work
# Cleanup
[ -f "$WORKSPACE_ROOT/$TMP1" ] && rm "$WORKSPACE_ROOT/$TMP1" || true
[ -f "$WORKSPACE_ROOT/$TMP2" ] && rm "$WORKSPACE_ROOT/$TMP2" || true
