import { GoogleAuth } from 'google-auth-library';
const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
async function run() {
  const client = await auth.getClient();
  const res = await client.request({
    url: `https://firestore.googleapis.com/v1/projects/gen-lang-client-0421439867/databases`
  });
  console.log(res.data);
}
run().catch(console.error);
