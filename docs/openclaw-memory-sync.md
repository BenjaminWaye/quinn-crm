# OpenClaw Memory Sync (Local -> Quinn CRM)

Mirror OpenClaw local memory state into Quinn CRM Memory module.

## Endpoint

- `POST /api/openclaw/syncMemory`
- Production URL:
  - `https://europe-west1-quinn-dash.cloudfunctions.net/api/openclaw/syncMemory`
- Header:
  - `x-openclaw-key: <OPENCLOW_SECRET>`

## Payload

```json
{
  "agentId": "openclaw-local",
  "generatedAt": "2026-03-10T21:00:00.000Z",
  "longTerm": {
    "title": "Long-Term Memory",
    "content": "Main long-term memory markdown/text here",
    "sourceFile": "memory/long_term.md",
    "wordCount": 1608,
    "updatedAt": "2026-03-10T20:50:00.000Z"
  },
  "entries": [
    {
      "id": "2026-03-10-research",
      "title": "2026-03-10 — Research",
      "content": "Entry body",
      "summary": "Optional summary",
      "tags": ["research", "models"],
      "sourceFile": "memory/2026-03-10.md",
      "wordCount": 772,
      "createdAt": "2026-03-10T08:00:00.000Z",
      "updatedAt": "2026-03-10T20:49:00.000Z"
    }
  ]
}
```

## Sync semantics

- Full snapshot behavior per `agentId`:
  - upsert incoming memory entries
  - delete entries in Firestore for that `agentId` not present in payload
- Long-term memory is written to:
  - `openclaw_memory/long_term`

## Firestore paths used

- `openclaw_memory_entries/{entryId}`
- `openclaw_memory/long_term`
- `system/openclaw_memory_sync`
