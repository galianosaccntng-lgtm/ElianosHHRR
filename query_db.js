import { Firestore } from '@google-cloud/firestore';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const db = new Firestore({
  projectId: config.projectId,
  databaseId: config.firestoreDatabaseId,
});
async function run() {
  const snapshot = await db.collection('interviews').get();
  console.log('Interviews found:', snapshot.size);
  snapshot.forEach(doc => {
    console.log(doc.id, '->', doc.data().candidateInfo?.name);
  });
}
run().catch(console.error);
