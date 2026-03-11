# OpenClaw Team Sync (Local -> Quinn CRM)

Mirror locally spawned OpenClaw agents into Team module.

## Endpoint

- `POST /api/openclaw/syncTeam`
- Production:
  - `https://europe-west1-quinn-dash.cloudfunctions.net/api/openclaw/syncTeam`
- Header:
  - `x-openclaw-key: <OPENCLOW_SECRET>`

## Payload

```json
{
  "sourceId": "openclaw-local",
  "generatedAt": "2026-03-10T22:30:00.000Z",
  "agents": [
    {
      "id": "henry",
      "name": "Henry",
      "role": "Chief of Staff",
      "description": "Coordinates the team",
      "parentId": null,
      "machine": "Mac Studio 2",
      "status": "active",
      "tags": ["orchestration", "delegation"],
      "avatar": "🦉",
      "order": 0
    },
    {
      "id": "charlie",
      "name": "Charlie",
      "role": "Infrastructure Engineer",
      "description": "Owns infra and automation",
      "parentId": "henry",
      "machine": "Mac Studio 2",
      "status": "active",
      "tags": ["infra"],
      "avatar": "🤖",
      "order": 1
    }
  ]
}
```

## Sync semantics

- Full snapshot per `sourceId`:
  - upsert all incoming agents
  - delete existing agents with same `sourceId` that are missing from payload

## Firestore paths

- `openclaw_agents/{agentId}`
- `system/openclaw_team_sync`
