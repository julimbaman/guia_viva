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
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.isAdmin;
  } catch (e) {
    return false;
  }
}
