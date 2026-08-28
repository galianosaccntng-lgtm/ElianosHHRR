import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, setDoc, doc } from 'firebase/firestore';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  try {
    const snapshot = await getDocs(collection(db, 'interviews'));
    console.log('Success! Found:', snapshot.size);
    // Write a test document
    await setDoc(doc(db, 'interviews', 'test_doc'), { test: true });
    console.log('Write success!');
  } catch (e) {
    console.error('Failed!', e.message);
  }
}
run();
