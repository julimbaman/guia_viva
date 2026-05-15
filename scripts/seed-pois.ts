/**
 * Pre-populates the Firestore poi_grids cache for major Colombian tourist cities.
 *
 * Requirements (set in .env or environment):
 *   VITE_FIREBASE_PROJECT_ID  - Firebase project ID
 *   GOOGLE_PLACES_API_KEY     - Google Places API key
 *   OPENAI_API_KEY or GEMINI_API_KEY - for AI narrations
 *
 * Auth (one of):
 *   GOOGLE_APPLICATION_CREDENTIALS - path to service account JSON (recommended)
 *   FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY - inline service account fields
 *
 * Usage:
 *   npx tsx scripts/seed-pois.ts
 *   npx tsx scripts/seed-pois.ts --city bogota   # single city
 *   npx tsx scripts/seed-pois.ts --dry-run        # show plan without calling APIs
 */

import 'dotenv/config';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';

// ── Config ────────────────────────────────────────────────────────────────────

const GOOGLE_PLACES_API_KEY =
  process.env.GOOGLE_PLACES_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
const USE_GEMINI = !process.env.OPENAI_API_KEY && !!process.env.GEMINI_API_KEY;

const VALID_TYPES = [
  'tourist_attraction',
  'historical_landmark',
  'museum',
  'park',
  'church',
  'art_gallery',
  'restaurant',
  'cafe',
];

// TTL for cached grids (7 days for walking mode)
const TTL_DAYS = 7;

// Delay between Google Places API calls to avoid rate-limit errors (ms)
const API_DELAY_MS = 300;

// ── City definitions ──────────────────────────────────────────────────────────
// Each zone has a center + grid size (how many cells in each direction).
// Grid step is 0.01° ≈ 1.1 km, matching the app's gridId formula.

interface Zone {
  name: string;
  cityCode: string;
  lat: number;
  lng: number;
  gridRadius: number; // cells in each direction (1 = 3×3, 2 = 5×5, etc.)
}

const CITIES: Record<string, Zone[]> = {
  bogota: [
    { name: 'La Candelaria',    cityCode: 'BOG', lat: 4.598,  lng: -74.076, gridRadius: 2 },
    { name: 'Zona Rosa',        cityCode: 'BOG', lat: 4.666,  lng: -74.053, gridRadius: 1 },
    { name: 'Usaquén',          cityCode: 'BOG', lat: 4.696,  lng: -74.030, gridRadius: 1 },
    { name: 'Monserrate',       cityCode: 'BOG', lat: 4.603,  lng: -74.056, gridRadius: 1 },
    { name: 'Parque de la 93',  cityCode: 'BOG', lat: 4.676,  lng: -74.048, gridRadius: 1 },
  ],
  medellin: [
    { name: 'El Poblado',       cityCode: 'MDE', lat: 6.209,  lng: -75.567, gridRadius: 2 },
    { name: 'Centro',           cityCode: 'MDE', lat: 6.244,  lng: -75.581, gridRadius: 2 },
    { name: 'Laureles',         cityCode: 'MDE', lat: 6.244,  lng: -75.601, gridRadius: 1 },
    { name: 'Parque Arvi',      cityCode: 'MDE', lat: 6.271,  lng: -75.499, gridRadius: 1 },
    { name: 'Belén',            cityCode: 'MDE', lat: 6.225,  lng: -75.601, gridRadius: 1 },
  ],
  cartagena: [
    { name: 'Ciudad Amurallada', cityCode: 'CTG', lat: 10.424, lng: -75.549, gridRadius: 2 },
    { name: 'Bocagrande',        cityCode: 'CTG', lat: 10.400, lng: -75.550, gridRadius: 1 },
    { name: 'Getsemaní',         cityCode: 'CTG', lat: 10.420, lng: -75.555, gridRadius: 1 },
    { name: 'Castillo San Felipe', cityCode: 'CTG', lat: 10.421, lng: -75.537, gridRadius: 1 },
  ],
  cali: [
    { name: 'Centro',            cityCode: 'CLO', lat: 3.452,  lng: -76.532, gridRadius: 2 },
    { name: 'San Antonio',       cityCode: 'CLO', lat: 3.447,  lng: -76.540, gridRadius: 1 },
    { name: 'Granada',           cityCode: 'CLO', lat: 3.462,  lng: -76.534, gridRadius: 1 },
  ],
  barranquilla: [
    { name: 'Centro',            cityCode: 'BAQ', lat: 10.969, lng: -74.781, gridRadius: 2 },
    { name: 'El Prado',          cityCode: 'BAQ', lat: 10.991, lng: -74.806, gridRadius: 1 },
  ],
  santa_marta: [
    { name: 'Centro Histórico',  cityCode: 'SMR', lat: 11.241, lng: -74.200, gridRadius: 2 },
    { name: 'El Rodadero',       cityCode: 'SMR', lat: 11.210, lng: -74.232, gridRadius: 1 },
  ],
  bucaramanga: [
    { name: 'Centro',            cityCode: 'BGA', lat: 7.131,  lng: -73.126, gridRadius: 2 },
    { name: 'Cabecera',          cityCode: 'BGA', lat: 7.109,  lng: -73.112, gridRadius: 1 },
  ],
  manizales: [
    { name: 'Centro',            cityCode: 'MNZ', lat: 5.067,  lng: -75.517, gridRadius: 2 },
  ],
  pereira: [
    { name: 'Centro',            cityCode: 'PEI', lat: 4.814,  lng: -75.696, gridRadius: 2 },
  ],
};

// ── Firebase Admin init ───────────────────────────────────────────────────────

function initFirebase() {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error('VITE_FIREBASE_PROJECT_ID env var is required');
  }

  if (admin.apps.length > 0) return admin.firestore();

  // Prefer GOOGLE_APPLICATION_CREDENTIALS (standard gcloud auth)
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ projectId });
    return admin.firestore();
  }

  // Fallback: inline service account fields
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      projectId,
    });
    return admin.firestore();
  }

  // Last resort: application default credentials (works in GCP environments)
  admin.initializeApp({ projectId });
  return admin.firestore();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function gridId(lat: number, lng: number): string {
  return `${lat.toFixed(2)}_${lng.toFixed(2)}_walking`;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function expandZone(zone: Zone): Array<{ lat: number; lng: number; label: string }> {
  const points: Array<{ lat: number; lng: number; label: string }> = [];
  const r = zone.gridRadius;
  for (let dlat = -r; dlat <= r; dlat++) {
    for (let dlng = -r; dlng <= r; dlng++) {
      const lat = Math.round((zone.lat + dlat * 0.01) * 100) / 100;
      const lng = Math.round((zone.lng + dlng * 0.01) * 100) / 100;
      points.push({ lat, lng, label: zone.name });
    }
  }
  return points;
}

// ── Google Places API ─────────────────────────────────────────────────────────

async function fetchPlaces(lat: number, lng: number) {
  const url = 'https://places.googleapis.com/v1/places:searchNearby';
  const body = {
    includedTypes: VALID_TYPES,
    maxResultCount: 10,
    locationRestriction: {
      circle: { center: { latitude: lat, longitude: lng }, radius: 600 },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY!,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.types,places.rating,places.userRatingCount,' +
        'places.location,places.photos,places.editorialSummary,places.regularOpeningHours',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google Places error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return (data.places || []) as any[];
}

// ── AI narrations ─────────────────────────────────────────────────────────────

async function generateNarrations(
  lat: number,
  lng: number,
  zoneName: string,
  places: any[]
): Promise<Record<string, string>> {
  if (!OPENAI_API_KEY || places.length === 0) return {};

  const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
    ...(USE_GEMINI
      ? { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' }
      : {}),
  });
  const model = USE_GEMINI ? 'gemini-2.5-pro' : (process.env.OPENAI_MODEL || 'gpt-4o');

  const context = places.slice(0, 5).map(p => ({
    id: p.id,
    name: p.displayName?.text,
    types: p.types,
    summary: p.editorialSummary?.text,
    schedule: p.regularOpeningHours?.weekdayDescriptions || 'Not available',
  }));

  const prompt = `You are an expert, passionate tour guide who speaks in Colombian Spanish.
I am at coordinates latitude ${lat}, longitude ${lng} in ${zoneName}.
Here are some real nearby places:
${JSON.stringify(context, null, 2)}

Generate a conversational narration in Colombian Spanish for each place, including a quirky or historical fact.
RULES:
1. Historical/cultural/museum places: 3-4 sentences. Others: 2-3 sentences.
2. If schedule is useful, mention it generally. NEVER say "está cerrado ahora" or "está abierto" — text is cached for 7 days.
Return ONLY a valid JSON object where keys are place IDs and values are narration strings.`;

  const completion = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content?.trim() || '{}';
  const match = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : '{}');
}

// ── Seed one grid cell ────────────────────────────────────────────────────────

async function seedGrid(
  db: admin.firestore.Firestore,
  lat: number,
  lng: number,
  cityCode: string,
  zoneName: string,
  dryRun: boolean
): Promise<{ skipped: boolean; count: number }> {
  const gid = gridId(lat, lng);
  const ref = db.collection('poi_grids').doc(gid);

  // Skip if already cached and not expired
  const existing = await ref.get();
  if (existing.exists) {
    const data = existing.data()!;
    const expiresAt = data.cacheExpiresAt?.toMillis?.() ?? 0;
    if (Date.now() < expiresAt) {
      return { skipped: true, count: data.places?.length ?? 0 };
    }
  }

  if (dryRun) return { skipped: false, count: 0 };

  let places: any[] = [];
  try {
    places = await fetchPlaces(lat, lng);
  } catch (e: any) {
    console.error(`  [error] fetchPlaces(${lat},${lng}): ${e.message}`);
    return { skipped: false, count: 0 };
  }

  if (places.length === 0) return { skipped: false, count: 0 };

  let narrations: Record<string, string> = {};
  if (OPENAI_API_KEY) {
    try {
      narrations = await generateNarrations(lat, lng, zoneName, places);
    } catch (e: any) {
      console.error(`  [warn] narrations(${gid}): ${e.message}`);
    }
  }

  const sanitized = places.map((p: any) => ({
    id: p.id,
    displayName: p.displayName,
    types: p.types,
    rating: p.rating ?? null,
    userRatingCount: p.userRatingCount ?? 0,
    editorialSummary: p.editorialSummary ?? null,
    location: p.location,
    pregeneratedNarration: narrations[p.id] ?? null,
    photos: p.photos ? p.photos.slice(0, 3) : [],
    regularOpeningHours: p.regularOpeningHours ?? null,
  }));

  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
  await ref.set(
    {
      gridId: gid,
      cityCode,
      transportMode: 'walking',
      places: sanitized,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      cacheExpiresAt: expiresAt,
      lastRefreshedAt: admin.firestore.FieldValue.serverTimestamp(),
      refreshPriority: 10,
    },
    { merge: true }
  );

  return { skipped: false, count: sanitized.length };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const cityFilter = args.includes('--city') ? args[args.indexOf('--city') + 1] : null;

  if (!GOOGLE_PLACES_API_KEY) {
    console.error('❌  GOOGLE_PLACES_API_KEY (or VITE_GOOGLE_MAPS_API_KEY) is required');
    process.exit(1);
  }

  const db = dryRun ? null as any : initFirebase();
  if (!dryRun) console.log('✅  Firebase Admin initialized');
  if (!OPENAI_API_KEY) console.warn('⚠️   No AI key found — narrations will be skipped');

  const targetCities = cityFilter
    ? { [cityFilter]: CITIES[cityFilter] }
    : CITIES;

  if (cityFilter && !CITIES[cityFilter]) {
    console.error(`❌  Unknown city "${cityFilter}". Available: ${Object.keys(CITIES).join(', ')}`);
    process.exit(1);
  }

  let totalGrids = 0;
  let totalPlaces = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const [cityKey, zones] of Object.entries(targetCities)) {
    console.log(`\n🏙️  ${cityKey.toUpperCase()}`);

    for (const zone of zones) {
      const points = expandZone(zone);
      console.log(`  📍 ${zone.name} — ${points.length} grid cell(s)`);

      for (const { lat, lng, label } of points) {
        const gid = gridId(lat, lng);
        process.stdout.write(`     ${gid} … `);

        try {
          const { skipped, count } = await seedGrid(db, lat, lng, zone.cityCode, label, dryRun);

          if (skipped) {
            console.log('(cached, skipped)');
            totalSkipped++;
          } else if (dryRun) {
            console.log('(dry-run)');
          } else {
            console.log(`✓ ${count} places`);
            totalPlaces += count;
          }
          totalGrids++;
        } catch (e: any) {
          console.log(`✗ ${e.message}`);
          totalErrors++;
        }

        if (!dryRun) await sleep(API_DELAY_MS);
      }
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`Grid cells processed : ${totalGrids}`);
  console.log(`Skipped (cached)     : ${totalSkipped}`);
  console.log(`Places seeded        : ${totalPlaces}`);
  if (totalErrors > 0) console.log(`Errors               : ${totalErrors}`);
  if (dryRun) console.log('\n(dry-run — no data was written)');
  else console.log('\n✅  Seed complete!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
