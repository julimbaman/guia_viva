// Firebase Admin SDK, used ONLY by the admin-only routes (server/routes/admin.ts) to:
// 1. Verify a caller's Firebase ID token and confirm they are a super admin
//    (a doc exists at admins/{uid}), and
// 2. Write curated POI data directly into Firestore, bypassing firestore.rules
//    entirely — appropriate here because access is already gated by (1).
//
// Credentials: on Cloud Run / GCP this picks up Application Default Credentials
// automatically (no config needed). For local development, set
// FIREBASE_SERVICE_ACCOUNT_JSON to the full service account JSON (as a string)
// or GOOGLE_APPLICATION_CREDENTIALS to a path, per the standard Firebase Admin
// SDK initialization rules.
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, cert, applicationDefault, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const firebaseConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf-8')
);

let app: App;

if (getApps().length === 0) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  app = initializeApp({
    credential: serviceAccountJson ? cert(JSON.parse(serviceAccountJson)) : applicationDefault(),
    projectId: firebaseConfig.projectId
  });
} else {
  app = getApps()[0]!;
}

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
