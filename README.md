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
- `OPENCLOW_SECRET`

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
