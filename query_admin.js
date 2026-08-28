import { Firestore } from '@google-cloud/firestore';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const options = {};
if (config.projectId) options.projectId = config.projectId;
if (config.firestoreDatabaseId) options.databaseId = config.firestoreDatabaseId;
const db = new Firestore(options);
async function run() {
  try {
    const snapshot = await db.collection('interviews').get();
    console.log('Count:', snapshot.size);
  } catch (e) {
    console.error('Error:', e.message);
  }
}
run();
