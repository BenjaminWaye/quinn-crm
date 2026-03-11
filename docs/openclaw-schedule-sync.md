# OpenClaw Schedule Sync (Local -> Quinn CRM)

This calendar is designed to mirror OpenClaw local schedules exactly.

## Source of truth

- Source of truth: OpenClaw local scheduler state.
- Quinn CRM stores a mirrored snapshot in Firestore collection:
  - `openclaw_schedules/{agentId}__{jobId}`
- Sync metadata is written per agent to:
  - `system/openclaw_schedule_sync_{agentId}`

## Sync endpoint

- URL: `POST /api/openclaw/syncSchedules`
- Full URL (prod): `https://europe-west1-quinn-dash.cloudfunctions.net/api/openclaw/syncSchedules`
- Auth header:
  - `x-openclaw-key: <OPENCLAW_SECRET>`

## Payload

```json
{
  "agentId": "openclaw-local",
  "timezone": "Europe/Stockholm",
  "generatedAt": "2026-03-10T20:00:00.000Z",
  "jobs": [
    {
      "id": "trend-radar",
      "name": "Trend Radar",
      "enabled": true,
      "alwaysRunning": true,
      "color": "amber",
      "productId": "callmycall",
      "scheduleType": "cron",
      "expression": "0 12 * * 1-5",
      "tags": ["always-running"],
      "weekSlots": [
        { "day": 1, "time": "12:00", "label": "Trend Radar" },
        { "day": 2, "time": "12:00", "label": "Trend Radar" }
      ],
      "nextRuns": [
        "2026-03-11T11:00:00.000Z"
      ],
      "sourceUpdatedAt": "2026-03-10T19:59:58.000Z"
    }
  ]
}
```

## Sync semantics

- For the provided `agentId`, this endpoint treats payload as a full snapshot:
  - upserts all incoming jobs
  - deletes jobs that exist in Firestore for that `agentId` but are missing in payload
- This gives deterministic 1:1 mirroring with local OpenClaw state.

## Recommended local behavior

- Trigger sync:
  - on startup
  - on every schedule change
  - every 60s heartbeat as fallback
- If sync fails, retry with backoff.
