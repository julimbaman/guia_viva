/**
 * Pre-populates Firestore for major Colombian tourist cities.
 * Seeds: poi_grids (walking + vehicle), city_index, and system tour_routes.
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
 *   npx tsx scripts/seed-pois.ts --city bogota    # single city
 *   npx tsx scripts/seed-pois.ts --dry-run         # show plan without API calls
 *   npx tsx scripts/seed-pois.ts --skip-tours      # skip system tour creation
 */

import 'dotenv/config';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';

// ── Config ────────────────────────────────────────────────────────────────────

const GOOGLE_PLACES_API_KEY =
  process.env.GOOGLE_PLACES_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
const USE_GEMINI = !process.env.OPENAI_API_KEY && !!process.env.GEMINI_API_KEY;

const WALKING_TYPES = [
  'tourist_attraction', 'historical_landmark', 'museum', 'park',
  'church', 'art_gallery', 'restaurant', 'cafe',
];

// Vehicle mode includes broader categories worth stopping for
const VEHICLE_TYPES = [
  'tourist_attraction', 'historical_landmark', 'museum', 'park',
  'church', 'art_gallery', 'amusement_park', 'zoo', 'aquarium',
  'stadium', 'shopping_mall',
];

const TTL = { walking: 7, vehicle: 30 }; // days
const API_DELAY_MS = 300;

// ── City definitions ──────────────────────────────────────────────────────────

interface Zone {
  name: string;
  lat: number;
  lng: number;
  gridRadius: number; // cells per side: 1→3×3, 2→5×5
}

interface CityDef {
  cityCode: string;
  cityName: string;
  country: string;
  continent: string;
  timezone: string;
  centerLat: number;
  centerLng: number;
  zones: Zone[];
}

const CITIES: Record<string, CityDef> = {
  bogota: {
    cityCode: 'BOG', cityName: 'Bogotá', country: 'Colombia',
    continent: 'South America', timezone: 'America/Bogota',
    centerLat: 4.598, centerLng: -74.076,
    zones: [
      { name: 'La Candelaria',   lat: 4.598,  lng: -74.076, gridRadius: 2 },
      { name: 'Zona Rosa',       lat: 4.666,  lng: -74.053, gridRadius: 1 },
      { name: 'Usaquén',         lat: 4.696,  lng: -74.030, gridRadius: 1 },
      { name: 'Monserrate',      lat: 4.603,  lng: -74.056, gridRadius: 1 },
      { name: 'Parque de la 93', lat: 4.676,  lng: -74.048, gridRadius: 1 },
    ],
  },
  medellin: {
    cityCode: 'MDE', cityName: 'Medellín', country: 'Colombia',
    continent: 'South America', timezone: 'America/Bogota',
    centerLat: 6.244, centerLng: -75.581,
    zones: [
      { name: 'El Poblado',  lat: 6.209,  lng: -75.567, gridRadius: 2 },
      { name: 'Centro',      lat: 6.244,  lng: -75.581, gridRadius: 2 },
      { name: 'Laureles',    lat: 6.244,  lng: -75.601, gridRadius: 1 },
      { name: 'Parque Arvi', lat: 6.271,  lng: -75.499, gridRadius: 1 },
      { name: 'Belén',       lat: 6.225,  lng: -75.601, gridRadius: 1 },
    ],
  },
  cartagena: {
    cityCode: 'CTG', cityName: 'Cartagena', country: 'Colombia',
    continent: 'South America', timezone: 'America/Bogota',
    centerLat: 10.424, centerLng: -75.549,
    zones: [
      { name: 'Ciudad Amurallada',  lat: 10.424, lng: -75.549, gridRadius: 2 },
      { name: 'Bocagrande',         lat: 10.400, lng: -75.550, gridRadius: 1 },
      { name: 'Getsemaní',          lat: 10.420, lng: -75.555, gridRadius: 1 },
      { name: 'Castillo San Felipe', lat: 10.421, lng: -75.537, gridRadius: 1 },
    ],
  },
  cali: {
    cityCode: 'CLO', cityName: 'Cali', country: 'Colombia',
    continent: 'South America', timezone: 'America/Bogota',
    centerLat: 3.452, centerLng: -76.532,
    zones: [
      { name: 'Centro',      lat: 3.452,  lng: -76.532, gridRadius: 2 },
      { name: 'San Antonio', lat: 3.447,  lng: -76.540, gridRadius: 1 },
      { name: 'Granada',     lat: 3.462,  lng: -76.534, gridRadius: 1 },
    ],
  },
  barranquilla: {
    cityCode: 'BAQ', cityName: 'Barranquilla', country: 'Colombia',
    continent: 'South America', timezone: 'America/Bogota',
    centerLat: 10.969, centerLng: -74.781,
    zones: [
      { name: 'Centro',   lat: 10.969, lng: -74.781, gridRadius: 2 },
      { name: 'El Prado', lat: 10.991, lng: -74.806, gridRadius: 1 },
    ],
  },
  santa_marta: {
    cityCode: 'SMR', cityName: 'Santa Marta', country: 'Colombia',
    continent: 'South America', timezone: 'America/Bogota',
    centerLat: 11.241, centerLng: -74.200,
    zones: [
      { name: 'Centro Histórico', lat: 11.241, lng: -74.200, gridRadius: 2 },
      { name: 'El Rodadero',      lat: 11.210, lng: -74.232, gridRadius: 1 },
    ],
  },
  bucaramanga: {
    cityCode: 'BGA', cityName: 'Bucaramanga', country: 'Colombia',
    continent: 'South America', timezone: 'America/Bogota',
    centerLat: 7.131, centerLng: -73.126,
    zones: [
      { name: 'Centro',   lat: 7.131,  lng: -73.126, gridRadius: 2 },
      { name: 'Cabecera', lat: 7.109,  lng: -73.112, gridRadius: 1 },
    ],
  },
  manizales: {
    cityCode: 'MNZ', cityName: 'Manizales', country: 'Colombia',
    continent: 'South America', timezone: 'America/Bogota',
    centerLat: 5.067, centerLng: -75.517,
    zones: [{ name: 'Centro', lat: 5.067, lng: -75.517, gridRadius: 2 }],
  },
  pereira: {
    cityCode: 'PEI', cityName: 'Pereira', country: 'Colombia',
    continent: 'South America', timezone: 'America/Bogota',
    centerLat: 4.814, centerLng: -75.696,
    zones: [{ name: 'Centro', lat: 4.814, lng: -75.696, gridRadius: 2 }],
  },
};

// ── Firebase Admin init ───────────────────────────────────────────────────────

function initFirebase(): admin.firestore.Firestore {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('VITE_FIREBASE_PROJECT_ID env var is required');
  if (admin.apps.length > 0) return admin.firestore();

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ projectId });
    return admin.firestore();
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (clientEmail && privateKey) {
    admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }), projectId });
    return admin.firestore();
  }

  // Application default credentials (GCP environments)
  admin.initializeApp({ projectId });
  return admin.firestore();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeGridId = (lat: number, lng: number, mode: 'walking' | 'vehicle') =>
  `${lat.toFixed(2)}_${lng.toFixed(2)}_${mode}`;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function expandZone(zone: Zone): Array<{ lat: number; lng: number }> {
  const pts: Array<{ lat: number; lng: number }> = [];
  for (let dlat = -zone.gridRadius; dlat <= zone.gridRadius; dlat++) {
    for (let dlng = -zone.gridRadius; dlng <= zone.gridRadius; dlng++) {
      pts.push({
        lat: Math.round((zone.lat + dlat * 0.01) * 100) / 100,
        lng: Math.round((zone.lng + dlng * 0.01) * 100) / 100,
      });
    }
  }
  return pts;
}

// ── Google Places API ─────────────────────────────────────────────────────────

async function fetchPlaces(lat: number, lng: number, mode: 'walking' | 'vehicle'): Promise<any[]> {
  const radius = mode === 'walking' ? 600 : 2000;
  const types = mode === 'walking' ? WALKING_TYPES : VEHICLE_TYPES;

  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY!,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.types,places.rating,places.userRatingCount,' +
        'places.location,places.photos,places.editorialSummary,places.regularOpeningHours',
    },
    body: JSON.stringify({
      includedTypes: types,
      maxResultCount: 10,
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google Places ${res.status}: ${JSON.stringify(err)}`);
  }
  return ((await res.json()).places || []) as any[];
}

// ── AI narrations ─────────────────────────────────────────────────────────────

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: OPENAI_API_KEY!,
      ...(USE_GEMINI ? { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' } : {}),
    });
  }
  return openaiClient;
}

async function generateNarrations(
  lat: number, lng: number, zoneName: string, places: any[]
): Promise<Record<string, string>> {
  if (!OPENAI_API_KEY || places.length === 0) return {};
  const model = USE_GEMINI ? 'gemini-2.5-pro' : (process.env.OPENAI_MODEL || 'gpt-4o');

  const context = places.slice(0, 5).map(p => ({
    id: p.id,
    name: p.displayName?.text,
    types: p.types,
    summary: p.editorialSummary?.text,
    schedule: p.regularOpeningHours?.weekdayDescriptions || 'Not available',
  }));

  const completion = await getOpenAI().chat.completions.create({
    model,
    messages: [{
      role: 'user',
      content: `You are an expert, passionate tour guide who speaks in Colombian Spanish.
I am at coordinates latitude ${lat}, longitude ${lng} in ${zoneName}.
Here are real nearby places:
${JSON.stringify(context, null, 2)}

Generate a conversational narration in Colombian Spanish for each place, including a quirky or historical fact.
RULES:
1. Historical/cultural/museum places: 3-4 sentences. Others: 2-3 sentences.
2. If schedule adds value, mention it generally. NEVER say "está cerrado ahora" or "está abierto" — text is cached for days.
Return ONLY a valid JSON object: keys = place IDs, values = narration strings.`,
    }],
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
  lat: number, lng: number,
  cityCode: string, zoneName: string,
  mode: 'walking' | 'vehicle',
  dryRun: boolean,
): Promise<{ skipped: boolean; count: number; places: any[] }> {
  const gid = makeGridId(lat, lng, mode);
  const ref = db.collection('poi_grids').doc(gid);

  const existing = await ref.get();
  if (existing.exists) {
    const d = existing.data()!;
    const expiresAt = d.cacheExpiresAt?.toMillis?.() ?? 0;
    if (Date.now() < expiresAt) {
      return { skipped: true, count: d.places?.length ?? 0, places: d.places ?? [] };
    }
  }

  if (dryRun) return { skipped: false, count: 0, places: [] };

  let places: any[] = [];
  try {
    places = await fetchPlaces(lat, lng, mode);
  } catch (e: any) {
    console.error(`  [error] fetchPlaces(${lat},${lng},${mode}): ${e.message}`);
    return { skipped: false, count: 0, places: [] };
  }

  if (places.length === 0) return { skipped: false, count: 0, places: [] };

  let narrations: Record<string, string> = {};
  if (OPENAI_API_KEY && mode === 'walking') {
    // Only generate narrations for walking mode (vehicle mode plays less frequently)
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

  const expiresAt = new Date(Date.now() + TTL[mode] * 24 * 60 * 60 * 1000);
  await ref.set({
    gridId: gid,
    cityCode,
    transportMode: mode,
    places: sanitized,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    cacheExpiresAt: expiresAt,
    lastRefreshedAt: admin.firestore.FieldValue.serverTimestamp(),
    refreshPriority: mode === 'walking' ? 10 : 5,
  }, { merge: true });

  return { skipped: false, count: sanitized.length, places: sanitized };
}

// ── Seed city_index ───────────────────────────────────────────────────────────

async function seedCityIndex(
  db: admin.firestore.Firestore,
  cityKey: string,
  city: CityDef,
  totalPOIs: number,
  dryRun: boolean,
) {
  if (dryRun) { console.log(`     city_index/${city.cityCode} … (dry-run)`); return; }
  process.stdout.write(`     city_index/${city.cityCode} … `);
  await db.collection('city_index').doc(city.cityCode).set({
    cityCode: city.cityCode,
    cityName: city.cityName,
    country: city.country,
    continent: city.continent,
    timezone: city.timezone,
    centerCoordinates: { lat: city.centerLat, lng: city.centerLng },
    defaultZoomLevel: 14,
    availableLanguages: ['es-CO', 'es', 'en'],
    totalPOIs,
    isActive: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`✓`);
}

// ── Create system tour routes ─────────────────────────────────────────────────

const TOUR_THEMES = [
  {
    key: 'historic',
    title: (city: string) => `Recorrido Histórico — ${city}`,
    description: (city: string) => `Descubre los monumentos, iglesias y sitios históricos más emblemáticos de ${city}.`,
    types: ['historical_landmark', 'museum', 'church'],
    maxPois: 8,
  },
  {
    key: 'art',
    title: (city: string) => `Arte y Cultura — ${city}`,
    description: (city: string) => `Sumérgete en la escena artística y cultural de ${city}: galerías, murales y centros culturales.`,
    types: ['art_gallery', 'museum', 'tourist_attraction'],
    maxPois: 6,
  },
  {
    key: 'food',
    title: (city: string) => `Gastronomía Local — ${city}`,
    description: (city: string) => `Los mejores sabores de ${city}: restaurantes típicos, cafés y mercados imperdibles.`,
    types: ['restaurant', 'cafe'],
    maxPois: 6,
  },
];

async function createSystemTours(
  db: admin.firestore.Firestore,
  city: CityDef,
  allPlaces: any[],
  dryRun: boolean,
) {
  for (const theme of TOUR_THEMES) {
    const candidates = allPlaces
      .filter(p => p.types?.some((t: string) => theme.types.includes(t)))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      // Deduplicate by place id
      .filter((p, idx, arr) => arr.findIndex(x => x.id === p.id) === idx)
      .slice(0, theme.maxPois);

    if (candidates.length < 2) continue; // not enough places for a meaningful tour

    const tourId = `system_${city.cityCode}_${theme.key}`;
    const tourData = {
      id: tourId,
      title: theme.title(city.cityName),
      description: theme.description(city.cityName),
      creatorId: 'system',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isPublic: true,
      type: 'system',
      cityCode: city.cityCode,
      pois: candidates,
    };

    if (dryRun) {
      console.log(`     tour_routes/${tourId} … (dry-run, ${candidates.length} POIs)`);
      continue;
    }

    process.stdout.write(`     tour_routes/${tourId} … `);
    await db.collection('tour_routes').doc(tourId).set(tourData, { merge: true });
    console.log(`✓ (${candidates.length} POIs)`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const skipTours = args.includes('--skip-tours');
  const cityFilter = args.includes('--city') ? args[args.indexOf('--city') + 1] : null;

  if (!GOOGLE_PLACES_API_KEY) {
    console.error('❌  GOOGLE_PLACES_API_KEY (or VITE_GOOGLE_MAPS_API_KEY) is required');
    process.exit(1);
  }

  const db = dryRun ? null as any : initFirebase();
  if (!dryRun) console.log('✅  Firebase Admin initialized');
  if (!OPENAI_API_KEY) console.warn('⚠️   No AI key — narrations will be skipped');

  const targetCities = cityFilter
    ? (() => {
        if (!CITIES[cityFilter]) {
          console.error(`❌  Unknown city "${cityFilter}". Available: ${Object.keys(CITIES).join(', ')}`);
          process.exit(1);
        }
        return { [cityFilter]: CITIES[cityFilter] };
      })()
    : CITIES;

  let totalGrids = 0, totalPlaces = 0, totalSkipped = 0, totalErrors = 0;

  for (const [cityKey, city] of Object.entries(targetCities)) {
    console.log(`\n🏙️  ${city.cityName.toUpperCase()} (${city.cityCode})`);
    const cityPlaces: any[] = [];

    // ── Walking grids ────────────────────────────────────────────────────────
    console.log('  🚶 Walking mode');
    for (const zone of city.zones) {
      const points = expandZone(zone);
      console.log(`    📍 ${zone.name} — ${points.length} cell(s)`);

      for (const { lat, lng } of points) {
        const gid = makeGridId(lat, lng, 'walking');
        process.stdout.write(`       ${gid} … `);
        try {
          const { skipped, count, places } = await seedGrid(db, lat, lng, city.cityCode, zone.name, 'walking', dryRun);
          if (skipped) { console.log('(cached)'); totalSkipped++; }
          else if (dryRun) { console.log('(dry-run)'); }
          else { console.log(`✓ ${count} places`); totalPlaces += count; }
          cityPlaces.push(...places);
          totalGrids++;
        } catch (e: any) {
          console.log(`✗ ${e.message}`); totalErrors++;
        }
        if (!dryRun) await sleep(API_DELAY_MS);
      }
    }

    // ── Vehicle grid (center cell only — larger radius) ──────────────────────
    console.log('  🚗 Vehicle mode (center)');
    const { lat: cLat, lng: cLng } = { lat: city.centerLat, lng: city.centerLng };
    const vGid = makeGridId(cLat, cLng, 'vehicle');
    process.stdout.write(`       ${vGid} … `);
    try {
      const { skipped, count, places } = await seedGrid(db, cLat, cLng, city.cityCode, city.cityName, 'vehicle', dryRun);
      if (skipped) { console.log('(cached)'); totalSkipped++; }
      else if (dryRun) { console.log('(dry-run)'); }
      else { console.log(`✓ ${count} places`); }
      cityPlaces.push(...places);
      totalGrids++;
    } catch (e: any) {
      console.log(`✗ ${e.message}`); totalErrors++;
    }
    if (!dryRun) await sleep(API_DELAY_MS);

    // ── City index ───────────────────────────────────────────────────────────
    console.log('  📇 City index');
    try {
      await seedCityIndex(db, cityKey, city, cityPlaces.length, dryRun);
    } catch (e: any) {
      console.error(`  [error] city_index: ${e.message}`);
    }

    // ── System tours ─────────────────────────────────────────────────────────
    if (!skipTours) {
      console.log('  🗺️  System tours');
      try {
        await createSystemTours(db, city, cityPlaces, dryRun);
      } catch (e: any) {
        console.error(`  [error] system tours: ${e.message}`);
      }
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`Grid cells processed : ${totalGrids}`);
  console.log(`Skipped (cached)     : ${totalSkipped}`);
  console.log(`Places seeded        : ${totalPlaces}`);
  if (totalErrors > 0) console.log(`Errors               : ${totalErrors}`);
  if (dryRun) console.log('\n(dry-run — no data written)');
  else console.log('\n✅  Seed complete!');
}

main().catch(err => { console.error(err); process.exit(1); });
