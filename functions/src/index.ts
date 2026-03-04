import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import express from 'express'

admin.initializeApp()
const app = express()
app.use(express.json())

// Simple prefix search fallback
app.get('/search/prefix', async (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase()
  if (!q) return res.json({ results: [] })
  const contactsRef = admin.firestore().collection('contacts')
  const snap = await contactsRef.orderBy('lastName').startAt(q).endAt(q + '\uf8ff').limit(20).get()
  const results = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  res.json({ results })
})

export const api = functions.https.onRequest(app)
