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
include_dirs = [
    'memory', 'activity_notes', 'intel', 'tasks', 'ops', 'docs', 'exports',
    'frames', 'frames5', 'cuts', 'cuts2', 'cuts3', 'cuts4', 'cuts5', 'adoc-export',
    'ComfyUI/output'
]
files = []
for p in root.iterdir():
    if p.is_file() and p.suffix.lower() in allowed_ext:
        files.append(p.relative_to(root).as_posix())
for d in include_dirs:
    dp = root / d
    if not dp.exists() or not dp.is_dir():
        continue
    for p in dp.rglob('*'):
        if p.is_file() and p.suffix.lower() in allowed_ext:
            files.append(p.relative_to(root).as_posix())
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

# 4) Run auto-worker for agent tasks across all products (ignore DEFAULT_PRODUCT_ID for this step)
DEFAULT_PRODUCT_ID="" node quinn-crm/scripts/dashboard-relay.mjs poll-and-work
