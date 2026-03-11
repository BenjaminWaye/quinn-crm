"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAlgoliaIndex = getAlgoliaIndex;
exports.indexContact = indexContact;
const algoliasearch_1 = __importDefault(require("algoliasearch"));
const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID;
const ALGOLIA_ADMIN_KEY = process.env.ALGOLIA_ADMIN_KEY;
function getAlgoliaIndex() {
    if (!ALGOLIA_APP_ID || !ALGOLIA_ADMIN_KEY)
        return null;
    const client = (0, algoliasearch_1.default)(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY);
    return client.initIndex('quinn_contacts');
}
async function indexContact(doc) {
    const idx = getAlgoliaIndex();
    if (!idx)
        return;
    const data = { objectID: doc.id, ...(doc.data() || {}) };
    await idx.saveObject(data);
}
