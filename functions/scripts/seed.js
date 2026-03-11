"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'quinn-dash' });
}
const db = admin.firestore();
async function seed() {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const contacts = [
        { firstName: 'Alice', lastName: 'Anderson', email: 'alice@example.com', createdAt: now },
        { firstName: 'Bob', lastName: 'Baker', email: 'bob@example.com', createdAt: now }
    ];
    for (const c of contacts) {
        await db.collection('contacts').add(c);
    }
    await db.collection('tasks').add({ title: 'Follow up', status: 'open', dueDate: null, createdAt: now });
    await db.collection('agents').add({ name: 'system', role: 'system', createdAt: now });
    await db.collection('token_ledger').add({ balance: 1000, owner: 'system', createdAt: now });
    await db.collection('acceptance_criteria').add({ name: 'basic', description: 'Basic AC', createdAt: now });
    await db.collection('automation_rules').add({ name: 'welcome-email', enabled: false, createdAt: now });
    await db.collection('audit_logs').add({ action: 'seed', actor: 'system', createdAt: now });
    console.log('Seed complete');
}
seed().catch(err => { console.error(err); process.exit(1); });
