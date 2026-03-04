Quinn CRM — Backend README

Overview
- Firebase Functions (2nd gen) using an express-compatible Fastify handler.
- Firestore as primary datastore.

Running locally
1. Install dependencies: npm install
2. Emulate functions and Firestore with Firebase Emulator Suite:
   firebase emulators:start --only functions,firestore

Seed data
- scripts/seed.ts contains a script that writes minimal test documents to Firestore (contacts, tasks, agents, token_ledger, acceptance_criteria, automation_rules, audit_logs).
- Run: npm run seed -- (uses emulator when FIRESTORE_EMULATOR_HOST set)

Environment
- Uses FIREBASE_CONFIG and GOOGLE_APPLICATION_CREDENTIALS when deploying.
- Do NOT commit credentials. Use CI secrets for deployment.
