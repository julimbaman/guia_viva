import { User } from 'firebase/auth';

// Calls the backend (server/routes/admin.ts GET /status) instead of reading
// admins/{uid} straight from Firestore: the backend also self-provisions the
// designated default super admin (SUPER_ADMIN_EMAIL) on their first check, a
// write the client is never allowed to make itself (see firestore.rules).
export async function checkAdminStatus(user: User): Promise<boolean> {
  try {
    const token = await user.getIdToken();
    const res = await fetch('/api/admin/status', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Not admin is a normal, silent outcome for most users — but a real
      // backend failure (e.g. Firebase Admin credentials missing in this
      // environment) should be visible in the console instead of just
      // quietly showing "not admin" with no way to tell the two apart.
      console.warn('Admin status check failed:', data.details || data.error || res.status);
      return false;
    }
    return !!data.isAdmin;
  } catch (e) {
    console.warn('Admin status check error:', e);
    return false;
  }
}
