import { Firestore } from '@google-cloud/firestore';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const db = new Firestore({
  projectId: config.projectId,
  databaseId: '(default)'
});
async function run() {
  const snapshot = await db.collection('interviews').get();
  console.log('Interviews found:', snapshot.size);
}
run().catch(console.error);
