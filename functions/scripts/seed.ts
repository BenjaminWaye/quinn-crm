import * as admin from 'firebase-admin'

if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'quinn-dash' })
}

const db = admin.firestore()

async function seed() {
  const now = admin.firestore.FieldValue.serverTimestamp()
  const contacts = [
    { firstName: 'Alice', lastName: 'Anderson', email: 'alice@example.com', createdAt: now },
    { firstName: 'Bob', lastName: 'Baker', email: 'bob@example.com', createdAt: now }
  ]
  for (const c of contacts) {
    await db.collection('contacts').add(c)
  }

  await db.collection('tasks').add({ title: 'Follow up', status: 'open', dueDate: null, createdAt: now })
  await db.collection('agents').add({ name: 'system', role: 'system', createdAt: now })
  await db.collection('token_ledger').add({ balance: 1000, owner: 'system', createdAt: now })
  await db.collection('acceptance_criteria').add({ name: 'basic', description: 'Basic AC', createdAt: now })
  await db.collection('automation_rules').add({ name: 'welcome-email', enabled: false, createdAt: now })
  await db.collection('audit_logs').add({ action: 'seed', actor: 'system', createdAt: now })

  console.log('Seed complete')
}

seed().catch(err => { console.error(err); process.exit(1) })
