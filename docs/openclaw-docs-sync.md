# OpenClaw Docs Sync (Local -> Quinn CRM)

Sync OpenClaw-generated documents into the Docs module.

## Endpoint

- `POST /api/openclaw/syncDocs`
- Production:
  - `https://europe-west1-quinn-dash.cloudfunctions.net/api/openclaw/syncDocs`
- Header:
  - `x-openclaw-key: <OPENCLOW_SECRET>`

## Payload

```json
{
  "agentId": "openclaw-local",
  "generatedAt": "2026-03-10T22:00:00.000Z",
  "docs": [
    {
      "id": "2026-02-25-vibe-coding-mainstream.md",
      "name": "2026-02-25-vibe-coding-mainstream.md",
      "type": ".md",
      "content": "Document content...",
      "downloadUrl": "https://.../optional-for-binary-files.png",
      "contentType": "text/markdown",
      "storagePath": "optional/storage/path",
      "summary": "Optional summary",
      "tags": ["journal", "content"],
      "sourceFile": "docs/2026-02-25-vibe-coding-mainstream.md",
      "productId": "callmycall",
      "sizeBytes": 3200,
      "wordCount": 583,
      "modifiedAt": "2026-03-10T21:59:00.000Z",
      "linkedTasks": [
        { "productId": "callmycall", "taskId": "t1", "title": "Draft outreach page" }
      ]
    }
  ]
}
```

## Sync semantics

- Full snapshot for a given `agentId`:
  - upsert incoming docs
  - delete docs for that `agentId` missing in payload

## Rendering contract

- For text-like docs (`.md`, `.txt`, `.html`), provide `content`.
- For binary/media docs (`.png`, `.jpg`, `.pdf`, `.mp3`, `.mp4`, etc), provide `downloadUrl` (or `url`) so the dashboard can render/open the file.
- `sourceFile` is metadata (workspace path) unless it is a full URL.

## Firestore paths

- `openclaw_docs/{docId}`
- `system/openclaw_docs_sync`
