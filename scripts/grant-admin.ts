// One-off bootstrap utility: grants super-admin access by creating a doc at
// admins/{uid}. This is intentionally NOT reachable from the app or its API —
// firestore.rules forbid writing to admins/{uid} from any client, and no
// server route exposes this either, so the only way to grant the first admin
// is running this script with real Firebase Admin credentials.
//
// Usage:
//   FIREBASE_SERVICE_ACCOUNT_JSON='<service-account-json>' npx tsx scripts/grant-admin.ts someone@example.com
//   npx tsx scripts/grant-admin.ts <uid>              # if already authenticated via Application Default Credentials
import 'dotenv/config';
import { adminAuth, adminDb } from '../server/firebaseAdmin.js';

async function main() {
  const identifier = process.argv[2];
  if (!identifier) {
    console.error('Usage: npx tsx scripts/grant-admin.ts <uid-or-email>');
    process.exit(1);
  }

  const user = identifier.includes('@')
    ? await adminAuth.getUserByEmail(identifier)
    : await adminAuth.getUser(identifier);

  await adminDb.collection('admins').doc(user.uid).set({
    email: user.email || null,
    grantedAt: new Date()
  });

  console.log(`Granted admin to ${user.email || user.uid} (uid: ${user.uid})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
