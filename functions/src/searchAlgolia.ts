// Placeholder: scaffold for Algolia indexing and search fallback
import * as admin from 'firebase-admin'
import algoliasearch from 'algoliasearch'

const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID
const ALGOLIA_ADMIN_KEY = process.env.ALGOLIA_ADMIN_KEY

export function getAlgoliaIndex() {
  if (!ALGOLIA_APP_ID || !ALGOLIA_ADMIN_KEY) return null
  const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY)
  return client.initIndex('quinn_contacts')
}

export async function indexContact(doc: FirebaseFirestore.DocumentSnapshot) {
  const idx = getAlgoliaIndex()
  if (!idx) return
  const data = { objectID: doc.id, ...(doc.data() || {}) }
  await idx.saveObject(data)
}
