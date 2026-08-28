import { Firestore } from '@google-cloud/firestore';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const db = new Firestore({
  projectId: config.projectId,
  databaseId: config.firestoreDatabaseId,
});
async function run() {
  try {
    const snapshot = await db.collection('interviews').get();
    console.log('Success! Found:', snapshot.size);
  } catch (e) {
    console.error('Failed!', e.message);
  }
}
run();
