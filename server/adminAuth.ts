// Gate for every /api/admin/* route: the caller must present a valid Firebase
// ID token (Authorization: Bearer <token>) AND have a doc at admins/{uid}.
// Firestore rules (see firestore.rules) mirror the same admins/{uid} check for
// client reads, but write access to poi_grids from these routes goes through
// the Admin SDK, which bypasses rules entirely — so this check is the ONLY
// thing standing between an anonymous request and writing arbitrary data into
// the shared POI cache. Treat it as security-critical.
import type { Request, Response, NextFunction } from 'express';
import { adminAuth, adminDb } from './firebaseAdmin.js';

export interface AdminRequest extends Request {
  adminUid?: string;
}

export async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) {
      return res.status(401).json({ error: 'Missing Authorization: Bearer <idToken> header' });
    }

    const decoded = await adminAuth.verifyIdToken(match[1]);
    const adminDoc = await adminDb.collection('admins').doc(decoded.uid).get();
    if (!adminDoc.exists) {
      return res.status(403).json({ error: 'Not an admin' });
    }

    req.adminUid = decoded.uid;
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
