#!/usr/bin/env bash
set -euo pipefail
WORKSPACE_ROOT="$(pwd)"

if [ -f "$WORKSPACE_ROOT/quinn-crm/functions/.env" ]; then
  set -a
  . "$WORKSPACE_ROOT/quinn-crm/functions/.env"
  set +a
fi
BASE_AGENT_ID="${DEFAULT_AGENT_ID:-quinn-main}"

TMP_DIR="$WORKSPACE_ROOT/.openclaw/tmp-sync"
mkdir -p "$TMP_DIR"
CHUNKS_JSON="$TMP_DIR/doc_chunks.json"

python3 - <<'PY'
import json
from pathlib import Path
root = Path.cwd()
out = root / '.openclaw' / 'tmp-sync' / 'doc_chunks.json'
allowed_ext = {
    '.md', '.markdown', '.txt', '.html', '.htm', '.pdf', '.mp4', '.mov', '.webm',
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.csv', '.json'
}

# Sync policy:
# - Include *all* documents/media under the workspace root
# - Exclude dev repos under "Sites/" (and other heavy/dev-only dirs)
exclude_top = {
    'Sites',
    '.git',
    'node_modules',
    '.openclaw',
    'worktrees',
    '.DS_Store',
}

files = []
for p in root.rglob('*'):
    rel = p.relative_to(root)

    # Exclude by top-level directory name
    if rel.parts and rel.parts[0] in exclude_top:
        continue

    # Exclude any top-level symlink that points into Sites/
    if rel.parts:
        top = root / rel.parts[0]
        try:
            if top.is_symlink() and 'Sites' in top.resolve().parts:
                continue
        except Exception:
            pass

    if p.is_file() and p.suffix.lower() in allowed_ext:
        files.append(rel.as_posix())

files = sorted(set(files))
# keep chunks small to avoid firestore transaction limits
chunk_size = 80
chunks = [files[i:i+chunk_size] for i in range(0, len(files), chunk_size)]
out.write_text(json.dumps(chunks), encoding='utf-8')
print(f"Prepared {len(files)} files in {len(chunks)} chunks")
PY

# 1) Sync workspace docs/media in chunked snapshots under partitioned agentIds
CHUNK_COUNT=$(python3 - <<'PY'
import json
from pathlib import Path
p = Path('.openclaw/tmp-sync/doc_chunks.json')
print(len(json.loads(p.read_text(encoding='utf-8'))))
PY
)

for ((i=0; i<CHUNK_COUNT; i++)); do
  FILES_ARG=$(python3 - <<PY
import json
from pathlib import Path
chunks = json.loads(Path('.openclaw/tmp-sync/doc_chunks.json').read_text(encoding='utf-8'))
print(','.join(chunks[$i]))
PY
)
  AGENT_ID="${BASE_AGENT_ID}-docs-${i}"
  node quinn-crm/scripts/dashboard-relay.mjs sync-workspace-docs --agentId="$AGENT_ID" --root="$WORKSPACE_ROOT" --files="$FILES_ARG"
done

# 2) Sync memory via dedicated memory endpoint (single authoritative agentId)
node quinn-crm/scripts/dashboard-relay.mjs sync-memory --agentId="$BASE_AGENT_ID" --root="$WORKSPACE_ROOT" --longTermPath="MEMORY.md" --memoryDir="memory"

# 3) Sync local OpenClaw cron schedules to Quinn CRM
node quinn-crm/scripts/dashboard-relay.mjs sync-schedules

# 4) Task auto-worker (DISABLED by default)
# Rationale: task execution is handled by dedicated cron jobs (quinn-task-executor + quinn-task-executor-code).
# The heartbeat should focus on syncing docs/memory/schedules and lightweight reporting, not mutating tasks.
# To run manually: set RUN_POLL_AND_WORK=1
if [ "${RUN_POLL_AND_WORK:-0}" = "1" ]; then
  DEFAULT_PRODUCT_ID="" node quinn-crm/scripts/dashboard-relay.mjs poll-and-work
fi
