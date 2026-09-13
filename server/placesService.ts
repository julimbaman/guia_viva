// Shared Google Places + OpenAI narration logic used by both the public
// /api/places/nearby route and the admin-only /api/admin/populate-site route,
// so pre-populating a site through the admin panel produces exactly the same
// shape of data (and respects the same cost guard) as a live user visit would.
import OpenAI from 'openai';
import { recordGooglePlacesCall, recordOpenAICall } from './costGuard.js';
import { assertHeaderSafe } from './envValidation.js';

export const INTEREST_TYPE_MAP: Record<string, string[]> = {
  'History': ['historical_landmark', 'museum', 'church'],
  'Architecture': ['historical_landmark', 'church', 'city_hall'],
  'Food': ['restaurant', 'cafe', 'bakery'],
  'Art': ['art_gallery', 'museum', 'performing_arts_theater'],
  'Nature': ['park', 'national_park', 'botanical_garden'],
  'Culture': ['museum', 'tourist_attraction', 'art_gallery']
};

const DEFAULT_TYPES = ['tourist_attraction', 'historical_landmark', 'museum', 'park', 'church', 'art_gallery'];

export function resolveIncludedTypes(types?: string[]): string[] {
  let includedTypes: string[] = [];
  if (types && Array.isArray(types) && types.length > 0) {
    types.forEach((t) => {
      if (INTEREST_TYPE_MAP[t]) includedTypes.push(...INTEREST_TYPE_MAP[t]);
      else includedTypes.push(t);
    });
    includedTypes = [...new Set(includedTypes)];
  }
  return includedTypes.length > 0 ? includedTypes : DEFAULT_TYPES;
}

const RICH_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.types,places.rating,places.userRatingCount,places.location,places.photos,places.editorialSummary,places.regularOpeningHours';

interface SearchNearbyOptions {
  lat: number;
  lng: number;
  radius: number;
  types?: string[];
  maxResultCount?: number;
  apiKey: string;
  fieldMask?: string;
}

type SearchNearbyResult =
  | { ok: true; places: any[] }
  | { ok: false; status: number; error: string };

export async function searchNearbyPlaces({ lat, lng, radius, types, maxResultCount = 15, apiKey, fieldMask = RICH_FIELD_MASK }: SearchNearbyOptions): Promise<SearchNearbyResult> {
  assertHeaderSafe(apiKey, 'GOOGLE_PLACES_API_KEY / VITE_GOOGLE_MAPS_API_KEY');
  const includedTypes = resolveIncludedTypes(types);
  const requestBody = {
    includedTypes: includedTypes.slice(0, 50),
    excludedTypes: ['supermarket', 'grocery_store', 'convenience_store', 'liquor_store', 'car_repair', 'car_dealer', 'shopping_mall'],
    maxResultCount,
    locationRestriction: {
      circle: {
        center: { latitude: Number(lat), longitude: Number(lng) },
        radius: Number(radius) || 500.0
      }
    }
  };

  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    return { ok: false as const, status: response.status, error: errorData.error?.message || JSON.stringify(errorData) };
  }

  recordGooglePlacesCall();
  const data = await response.json();
  return { ok: true as const, places: data.places || [] };
}

interface NarrationContext {
  lat: number;
  lng: number;
  zoneName?: string;
}

// Generates one narration per place via a single OpenAI call (cheaper than one
// call per place). Returns {} on any failure so callers can proceed without
// pregenerated narrations rather than fail the whole request.
export async function generateNarrationsForPlaces(places: any[], context: NarrationContext): Promise<Record<string, string>> {
  const openaiApiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  if (!openaiApiKey || places.length === 0) return {};

  try {
    assertHeaderSafe(openaiApiKey, 'OPENAI_API_KEY / GEMINI_API_KEY');
    const openai = new OpenAI({
      apiKey: openaiApiKey,
      ...(process.env.OPENAI_API_KEY ? {} : { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' })
    });
    const model = process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || 'gpt-4o') : 'gemini-2.5-pro';

    const placesContext = places.map((p: any) => ({
      id: p.id,
      name: p.displayName?.text,
      types: p.types,
      summary: p.editorialSummary?.text,
      schedule: p.regularOpeningHours?.weekdayDescriptions || 'Not available'
    }));

    const prompt = `You are an expert, passionate tour guide who speaks in Colombian Spanish.
I am at coordinates latitude ${context.lat}, longitude ${context.lng}${context.zoneName && context.zoneName !== 'Unknown Zone' ? ` in ${context.zoneName}` : ''}.
Here are some real nearby places:
${JSON.stringify(placesContext, null, 2)}

Please generate a conversational narration in Colombian Spanish for each place, including a quirky or historical fact, as if you were a tour guide pointing it out.
IMPORTANT RULES:
1. If the place is historical, cultural, or a museum, provide a slightly longer, more detailed explanation (3-4 sentences). Otherwise, keep it to 2-3 sentences.
2. If the schedule is provided and adds value, mention it generally (e.g., "Abre sus puertas de martes a domingo..."). DO NOT say "está cerrado ahora" or "está abierto" because this text will be cached for 7 days.
Return ONLY a valid JSON object where keys are the place IDs and values are the narration strings. Do not include markdown formatting.`;

    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    });

    recordOpenAICall(completion.usage);

    let content = completion.choices[0]?.message?.content?.trim() || '{}';
    const match = content.match(/\{[\s\S]*\}/);
    if (match) content = match[0];
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to generate narrations:', error);
    return {};
  }
}

// Same shape the client writes to poi_grids.places from usePlaces.ts, so
// admin-curated grids and organically-cached grids are indistinguishable to
// the app once written.
export function sanitizePlacesForStorage(places: any[]) {
  return places.map((p: any) => ({
    id: p.id,
    displayName: p.displayName,
    types: p.types,
    rating: p.rating || null,
    userRatingCount: p.userRatingCount || 0,
    editorialSummary: p.editorialSummary || null,
    location: p.location,
    pregeneratedNarration: p.pregeneratedNarration || null,
    photos: p.photos ? p.photos.slice(0, 3) : [],
    regularOpeningHours: p.regularOpeningHours || null
  }));
}
