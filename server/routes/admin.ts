// Admin-only routes: let a super admin pre-populate poi_grids for a specific
// site (address or lat/lng) in a controlled way, so that when a real user
// later visits that spot, usePlaces.fetchNearbyPlaces hits Firestore cache
// immediately instead of calling Google/OpenAI live. Every route here is
// gated by requireAdmin (see server/adminAuth.ts).
import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAdmin, checkAdminStatus, type AdminRequest } from '../adminAuth.js';
import { adminDb } from '../firebaseAdmin.js';
import { isBudgetExceeded } from '../costGuard.js';
import { searchNearbyPlaces, generateNarrationsForPlaces, sanitizePlacesForStorage } from '../placesService.js';

const router = Router();

// Not gated by requireAdmin: this is how the frontend discovers whether the
// signed-in user is an admin at all (and how the designated super admin gets
// their admins/{uid} doc created the very first time, with no manual step).
router.get('/status', async (req, res) => {
  try {
    const { isAdmin } = await checkAdminStatus(req);
    res.json({ isAdmin });
  } catch (error: any) {
    // `details` is intentionally included here (unlike requireAdmin's stricter
    // 401s): this is the one endpoint the frontend calls just to find out
    // whether the whole admin subsystem is even working, so the real reason
    // (e.g. Firebase Admin credentials missing in this environment) needs to
    // be visible in the browser's Network tab without server log access.
    console.error('Admin status check error:', error);
    res.status(401).json({ isAdmin: false, error: 'Invalid or expired token', details: error?.message });
  }
});

router.use(requireAdmin);

// Broader than the runtime interest defaults (History/Culture/...) since this
// is a deliberate, one-time curation pass meant to cover "restaurantes,
// museos, sitios de interés, parques famosos, etc." in one go.
const ADMIN_DEFAULT_TYPES = [
  'restaurant', 'cafe', 'bakery', 'museum', 'art_gallery', 'tourist_attraction',
  'historical_landmark', 'park', 'church', 'night_club', 'bar', 'shopping_mall'
];

// The app only ever reads two grid documents per coordinate — see getGridId()
// in src/hooks/usePlaces.ts: radius <=1000 resolves to a "walking" grid,
// >1000 to a "vehicle" grid. Populating both means the site is covered
// whether a visitor arrives on foot or by car.
const GRID_MODES: { mode: 'walking' | 'vehicle'; radius: number }[] = [
  { mode: 'walking', radius: 500 },
  { mode: 'vehicle', radius: 2000 }
];

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; formattedAddress: string } | null> {
  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('Missing Google Geocoding API Key');

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.status !== 'OK' || !data.results?.[0]) return null;

  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng, formattedAddress: data.results[0].formatted_address };
}

router.post('/populate-site', async (req: AdminRequest, res) => {
  try {
    const { address, lat: bodyLat, lng: bodyLng, label, cityCode, types } = req.body;

    let lat = bodyLat;
    let lng = bodyLng;
    let resolvedAddress = address;

    if (lat === undefined || lng === undefined) {
      if (!address) return res.status(400).json({ error: 'Provide either { lat, lng } or { address }' });
      const geocoded = await geocodeAddress(address);
      if (!geocoded) return res.status(400).json({ error: `Could not geocode address: ${address}` });
      lat = geocoded.lat;
      lng = geocoded.lng;
      resolvedAddress = geocoded.formattedAddress;
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Missing Google Maps API Key' });

    const results: any[] = [];

    for (const { mode, radius } of GRID_MODES) {
      if (isBudgetExceeded()) {
        results.push({ mode, radius, skipped: true, reason: 'Daily API budget exceeded' });
        continue;
      }

      const search = await searchNearbyPlaces({
        lat, lng, radius, apiKey,
        types: types && types.length ? types : ADMIN_DEFAULT_TYPES,
        maxResultCount: 20
      });

      if (!search.ok) {
        results.push({ mode, radius, error: search.error });
        continue;
      }

      let places = search.places;
      if (places.length > 0 && !isBudgetExceeded()) {
        const narrations = await generateNarrationsForPlaces(places.slice(0, 10), { lat, lng, zoneName: cityCode });
        places = places.map((p: any) => ({ ...p, pregeneratedNarration: narrations[p.id] || null }));
      }

      const gridId = `${Number(lat).toFixed(2)}_${Number(lng).toFixed(2)}_${mode}`;
      const sanitized = sanitizePlacesForStorage(places);

      await adminDb.collection('poi_grids').doc(gridId).set({
        gridId,
        cityCode: cityCode || 'Unknown',
        transportMode: mode,
        places: sanitized,
        updatedAt: FieldValue.serverTimestamp(),
        // Manually curated data shouldn't silently expire and re-fetch like an
        // organic cache entry does (7/30 days) — give it a much longer TTL.
        cacheExpiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        lastRefreshedAt: FieldValue.serverTimestamp(),
        refreshPriority: 20,
        curatedByAdmin: true,
        curatedLabel: label || resolvedAddress || gridId,
        curatedBy: req.adminUid
      }, { merge: true });

      results.push({
        mode,
        radius,
        gridId,
        placesFound: places.length,
        placeNames: sanitized.map((p: any) => p.displayName?.text).filter(Boolean)
      });
    }

    res.json({ address: resolvedAddress, lat, lng, results });
  } catch (error: any) {
    console.error('Admin populate-site error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

router.get('/sites', async (_req, res) => {
  try {
    const snapshot = await adminDb.collection('poi_grids').where('curatedByAdmin', '==', true).get();
    const sites = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        gridId: doc.id,
        label: data.curatedLabel,
        transportMode: data.transportMode,
        placesCount: Array.isArray(data.places) ? data.places.length : 0,
        updatedAt: data.updatedAt?.toDate?.() ?? null
      };
    });
    res.json({ sites });
  } catch (error: any) {
    console.error('Admin list sites error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

router.get('/users', async (_req, res) => {
  try {
    const usersRef = adminDb.collection('users');
    const [countSnap, recentSnap] = await Promise.all([
      usersRef.count().get(),
      usersRef.orderBy('createdAt', 'desc').limit(25).get()
    ]);

    const recentUsers = recentSnap.docs.map(doc => {
      const data = doc.data();
      return {
        uid: doc.id,
        email: data.email || null,
        displayName: data.displayName || null,
        onboardingComplete: !!data.onboardingComplete,
        createdAt: data.createdAt?.toDate?.() ?? null
      };
    });

    res.json({ totalUsers: countSnap.data().count, recentUsers });
  } catch (error: any) {
    console.error('Admin list users error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
