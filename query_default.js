import { Firestore } from '@google-cloud/firestore';
const db = new Firestore();
async function run() {
  try {
    const snapshot = await db.collection('interviews').get();
    console.log('Count:', snapshot.size);
  } catch (e) {
    console.error('Error:', e.message);
  }
}
run();
