import { initializeApp } from 'firebase/app';
import { getFirestore, doc, deleteDoc } from 'firebase/firestore';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  await deleteDoc(doc(db, 'interviews', 'test_doc'));
  console.log('Deleted test doc');
}
run();
