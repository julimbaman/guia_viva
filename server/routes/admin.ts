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
import { assertHeaderSafe, resolveEnvVar } from '../envValidation.js';

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

// A single Nearby Search call caps out at 20 results, and mixing many types
// into one call lets Google's ranking crowd out whole categories (e.g. all
// 20 slots going to restaurants, zero to parks). Grouped, targeted calls —
// one per category — guarantee variety across "restaurantes, iglesias,
// museos, parques, centros comerciales, etc." and let a single populate
// pass realistically gather 30+ distinct POIs once merged. Each group is
// one Google Places call (tracked/gated by the same daily cost guard as
// everything else). Used as the default when the admin doesn't pass custom
// `types` — a custom list is still honored as a single group/call.
const CATEGORY_GROUPS: string[][] = [
  ['restaurant', 'cafe', 'bakery', 'ice_cream_shop'],
  ['church', 'museum', 'art_gallery', 'tourist_attraction', 'historical_landmark'],
  ['park', 'shopping_mall']
];

// The app only ever reads two grid documents per coordinate — see getGridId()
// in src/hooks/usePlaces.ts: radius <=1000 resolves to a "walking" grid,
// >1000 to a "vehicle" grid. Populating both means the site is covered
// whether a visitor arrives on foot or by car. The "walking" grid is also
// shared by the app's stationary (200m) and running (1000m) modes — see
// getSearchRadius() in src/utils/movement.ts — so it's searched at the full
// 1000m a visitor in ANY of those three modes could request, not just the
// 500m a walker typically uses.
const GRID_MODES: { mode: 'walking' | 'vehicle'; radius: number }[] = [
  { mode: 'walking', radius: 1000 },
  { mode: 'vehicle', radius: 2000 }
];

// Ranks places with a photo first (so the first ones stored — which become
// the horizontally-scrollable "suggestions" cards in Active.tsx — actually
// have something to show), then by rating, so a rich pool of 30+ candidates
// leads with the most appealing ones rather than in Google's raw response order.
function rankPlaces(places: any[]): any[] {
  return [...places].sort((a, b) => {
    const aHasPhoto = (a.photos?.length || 0) > 0 ? 1 : 0;
    const bHasPhoto = (b.photos?.length || 0) > 0 ? 1 : 0;
    if (aHasPhoto !== bHasPhoto) return bHasPhoto - aHasPhoto;
    return (b.rating || 0) - (a.rating || 0);
  });
}

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

    const googleKey = resolveEnvVar(['GOOGLE_PLACES_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY']);
    if (!googleKey) return res.status(500).json({ error: 'Missing Google Maps API Key (checked GOOGLE_PLACES_API_KEY, VITE_GOOGLE_MAPS_API_KEY)' });
    assertHeaderSafe(googleKey.value, googleKey.name);

    const results: any[] = [];

    const groups = types && types.length ? [types] : CATEGORY_GROUPS;

    for (const { mode, radius } of GRID_MODES) {
      if (isBudgetExceeded()) {
        results.push({ mode, radius, skipped: true, reason: 'Daily API budget exceeded' });
        continue;
      }

      // Run each category group as its own call and merge by place ID —
      // this is what actually gets past the 20-result-per-call ceiling.
      const byId = new Map<string, any>();
      let lastGroupError: string | null = null;
      for (const group of groups) {
        if (isBudgetExceeded()) break;
        const search = await searchNearbyPlaces({ lat, lng, radius, apiKey: googleKey.value, types: group, maxResultCount: 20 });
        if (!search.ok) {
          lastGroupError = search.error;
          continue;
        }
        for (const p of search.places) {
          if (!byId.has(p.id)) byId.set(p.id, p);
        }
      }

      if (byId.size === 0) {
        results.push({ mode, radius, error: lastGroupError || 'No places found' });
        continue;
      }

      let places = rankPlaces(Array.from(byId.values()));
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
