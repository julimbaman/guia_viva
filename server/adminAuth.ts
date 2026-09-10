// Gate for every /api/admin/* route: the caller must present a valid Firebase
// ID token (Authorization: Bearer <token>) AND have a doc at admins/{uid}.
// Firestore rules (see firestore.rules) mirror the same admins/{uid} check for
// client reads, but write access to poi_grids/users from these routes goes
// through the Admin SDK, which bypasses rules entirely — so this check is the
// ONLY thing standing between an anonymous request and admin-level access.
// Treat it as security-critical.
import type { Request, Response, NextFunction } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from './firebaseAdmin.js';

export interface AdminRequest extends Request {
  adminUid?: string;
}

// The one account that is admin "out of the box", with no manual Firestore
// provisioning step required — see checkAdminStatus() below. Anyone else must
// be granted via `npm run grant-admin <uid-or-email>` or the Firebase Console.
export const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'julio.camacho@woobsing.com').toLowerCase();

class MissingTokenError extends Error {}

async function verifyIdTokenFromHeader(req: Request): Promise<{ uid: string; email?: string }> {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new MissingTokenError('Missing Authorization: Bearer <idToken> header');
  const decoded = await adminAuth.verifyIdToken(match[1]);
  return { uid: decoded.uid, email: decoded.email };
}

export async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  try {
    const { uid } = await verifyIdTokenFromHeader(req);
    const adminDoc = await adminDb.collection('admins').doc(uid).get();
    if (!adminDoc.exists) {
      return res.status(403).json({ error: 'Not an admin' });
    }
    req.adminUid = uid;
    next();
  } catch (error) {
    if (error instanceof MissingTokenError) {
      return res.status(401).json({ error: error.message });
    }
    console.error('Admin auth error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Resolves whether the current caller is an admin, self-provisioning
// SUPER_ADMIN_EMAIL the first time they check. This is the ONLY code path
// that can create an admins/{uid} doc for an account that doesn't already
// have one — and it only ever does so for the designated super admin email.
// Everyone else must already have a doc (granted out-of-band) to pass.
export async function checkAdminStatus(req: Request): Promise<{ uid: string; isAdmin: boolean }> {
  const { uid, email } = await verifyIdTokenFromHeader(req);
  const adminRef = adminDb.collection('admins').doc(uid);
  const adminDoc = await adminRef.get();

  if (adminDoc.exists) return { uid, isAdmin: true };

  if (email && email.toLowerCase() === SUPER_ADMIN_EMAIL) {
    await adminRef.set({
      email,
      grantedAt: FieldValue.serverTimestamp(),
      grantedBy: 'default-super-admin-bootstrap'
    });
    return { uid, isAdmin: true };
  }

  return { uid, isAdmin: false };
}
