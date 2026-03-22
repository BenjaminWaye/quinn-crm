# Quinn CRM Product OS (MVP)

Private, product-first Product OS dashboard for single-owner use. The app is scoped per product for CRM, Tasks, KPI, Activity, and secure OpenClaw operations.

## Implemented
- Owner-gated auth shell with protected routes.
- Product workspace routing:
  - `/login`
  - `/products`
  - `/products/:productId`
  - `/products/:productId/crm`
  - `/products/:productId/crm/:contactId`
  - `/products/:productId/tasks`
  - `/products/:productId/tasks/:taskId`
  - `/products/:productId/kpi`
  - `/products/:productId/activity`
  - `/settings`
- Sidebar product switching:
  - Desktop: hideable sidebar.
  - Mobile: temporary popup sidebar for switching product.
- Mobile bottom navigation for product sections.
- Callable functions for core writes.
- OpenClaw HTTPS endpoints with secret validation.
- Centralized activity writes and `agent_runs` logging.
- Owner-only Firestore rules and initial indexes.

## Stack
- Frontend: React + TypeScript + Vite (`frontend/`)
- Backend: Firebase Cloud Functions TypeScript (`functions/`)
- Data: Firestore + Firebase Auth + Firebase Hosting
- Shared contracts: `shared/`

## Setup
1. Install dependencies:
   - `npm --prefix frontend install`
   - `npm --prefix functions install`
2. Configure env files:
   - Copy `frontend/.env.example` -> `frontend/.env`
   - Copy `functions/.env.example` -> `functions/.env`
3. Build:
   - `npm --prefix frontend run build`
   - `npm --prefix functions run build`
4. Start emulators:
   - `firebase emulators:start`

## Required Environment Variables
Frontend (`frontend/.env`):
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_OWNER_UID`
- `VITE_SKIP_AUTH` (`true` to bypass auth temporarily)

Functions (`functions/.env`):
- `OWNER_UID`
- `OPENCLOW_SECRET` (or `OPENCLAW_SECRET`)
- `STORAGE_BUCKET` (recommended, e.g. `quinn-dash.firebasestorage.app`)
- `LOG_AGENT_RUN_READS` (optional, default `false`)
- `LOG_AGENT_RUN_SYNCS` (optional, default `false`)
- `OPENCLOW_SYNC_MIN_INTERVAL_SECONDS` (optional, default `60`)
- `OPENCLOW_MAX_SYNC_ITEMS` (optional, default `500`)
- `OPENCLOW_LIST_LIMIT_MAX` (optional, default `50`)
- `SYNC_DELETE_MISSING` (optional, default `false`; set true only for trusted full snapshots)

Note: `functions.config()` / Runtime Config is no longer used.

## Deploy
- `firebase deploy --only hosting`
- `firebase deploy --only functions`
- `firebase deploy --only firestore:rules`
- `firebase deploy --only firestore:indexes`

## Callable Functions
- `createProduct`
- `updateProduct`
- `createContact`
- `updateContact`
- `createTask`
- `updateTask`
- `addTaskComment`
- `createKpi`
- `addKpiEntry`

## OpenClaw Endpoints
All are `POST` and require header `x-openclaw-key: <OPENCLOW_SECRET>`.
- `/api/openclaw/listProducts`
- `/api/openclaw/getProductOverview`
- `/api/openclaw/listTasks`
- `/api/openclaw/getTask`
- `/api/openclaw/createTask`
- `/api/openclaw/updateTask`
- `/api/openclaw/addTaskComment`
- `/api/openclaw/listContacts`
- `/api/openclaw/addKpiEntry`
- `/api/openclaw/addActivityNote`
- `/api/openclaw/syncMemory`
- `/api/openclaw/syncDocs`

Attachment behavior for OpenClaw:
- `createTask` supports `attachments` (array of `{ name, contentType, dataUrl }`).
- `updateTask` supports `patch.newAttachments` (same upload format).
- `addTaskComment` supports `attachments` (same upload format).
- `listTasks` and `getTask` return task-level `attachments` with `downloadUrl`.
- `getTask` with `includeComments=true` returns comment attachments in each comment row.

Docs sync behavior (`/api/openclaw/syncDocs`):
- Text docs: send `content` (`.md`, `.txt`, `.html`) and optional `sourceFile`.
- Binary/media docs (`.png`, `.pdf`, `.mp3`, `.mp4`, etc): send `content` as a `data:` URL and backend will upload to Cloud Storage and persist `downloadUrl`.
- If binary content is already externally hosted, you can send `downloadUrl` (or `url`) directly.
- `sourceFile` alone is treated as workspace metadata; it is not downloadable unless it is already a full URL.
- The backend now performs delta sync: unchanged docs are skipped to reduce Firestore writes.

Example `getTask` request:
```json
{
  "productId": "callmycall",
  "taskId": "abc123",
  "includeComments": true,
  "commentLimit": 20
}
```

Example attachment upload object:
```json
{
  "name": "sop-draft.md",
  "contentType": "text/markdown",
  "dataUrl": "data:text/markdown;base64,IyBTT1AgRHJhZnQKLi4u"
}
```

## Dashboard Relay Attachment Support
`scripts/dashboard-relay.mjs` supports local file attachments via `--attach` for:
- `create`
- `update`
- `comment`

Examples:
- `node scripts/dashboard-relay.mjs create --productId=callmycall --title="Draft SOP" --description="..." --attach="docs/sop.md"`
- `node scripts/dashboard-relay.mjs update --productId=callmycall --taskId=abc123 --status=review --attach="exports/report.pdf,screenshots/flow.png"`
- `node scripts/dashboard-relay.mjs comment --productId=callmycall --taskId=abc123 --comment="SOP draft attached" --attach="docs/sop.md"`

Notes:
- `--attach` takes a comma-separated list of local file paths.
- Files are encoded as `dataUrl` payloads before sending.
- Missing/unreadable files are skipped by the relay script.
- Keep total payload size small (Cloud Functions request limits apply).

## Response Envelope
```ts
{ ok: boolean; data?: unknown; error?: string }
```

## Security Notes
- Firestore client access is owner-only (see `firestore.rules`).
- Callable functions enforce owner auth.
- OpenClaw never writes directly to Firestore in v1; writes flow through protected HTTPS endpoints.
- Backend uses explicit checks even though Admin SDK bypasses Firestore rules.

## Planning Reference
The long-form implementation plan is stored at:
- `docs/product-os-implementation-plan.txt`
