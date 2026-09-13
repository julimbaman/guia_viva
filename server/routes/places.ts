import { Router } from 'express';
import { isBudgetExceeded, recordGooglePlacesCall, DAILY_BUDGET_USD } from '../costGuard.js';
import { resolveIncludedTypes, searchNearbyPlaces, generateNarrationsForPlaces } from '../placesService.js';

const router = Router();

router.post('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius, types, zoneName } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Missing lat or lng' });
    }

    // Root-level cost brake: refuse to call Google/OpenAI at all once today's
    // estimated spend hits the configured ceiling. Callers should already be
    // hitting Firestore cache first, but this is the backstop if they don't.
    if (isBudgetExceeded()) {
      return res.status(429).json({ error: 'Daily API budget exceeded', budgetExceeded: true, limitUSD: DAILY_BUDGET_USD });
    }

    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!googleApiKey) {
      return res.status(500).json({ error: 'Missing Google Maps API Key' });
    }

    // 1. Fetch real places from Google Places API
    const result = await searchNearbyPlaces({ lat, lng, radius, types, maxResultCount: 15, apiKey: googleApiKey });
    if (!result.ok) {
      console.error('Google Places API Error (Nearby):', result.status, result.error);
      return res.status(500).json({ error: 'Failed to fetch places from Google', details: result.error });
    }

    let places = result.places;
    if (places.length === 0) {
      return res.json({ places: [] });
    }

    // 2. Generate narrations for the top 5 places using OpenAI (re-check the
    // budget since the Places call above may have just pushed us over it).
    if (!isBudgetExceeded()) {
      const topPlaces = places.slice(0, 5);
      const narrations = await generateNarrationsForPlaces(topPlaces, { lat, lng, zoneName });
      places = places.map((p: any) => ({ ...p, pregeneratedNarration: narrations[p.id] || null }));
    }

    res.json({ places });
  } catch (error: any) {
    console.error('Places route error:', error.message || error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

router.post('/search', async (req, res) => {
  try {
    const { query, lat, lng } = req.body;
    if (!query) return res.status(400).json({ error: 'Missing query' });

    if (isBudgetExceeded()) {
      return res.status(429).json({ error: 'Daily API budget exceeded', budgetExceeded: true, limitUSD: DAILY_BUDGET_USD, places: [] });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing Google Maps API Key' });
    }

    const url = 'https://places.googleapis.com/v1/places:searchText';
    const requestBody: any = {
      textQuery: query,
      maxResultCount: 10,
    };

    // Optional location bias
    if (lat && lng) {
      requestBody.locationBias = {
        circle: {
          center: { latitude: Number(lat), longitude: Number(lng) },
          radius: 50000.0 // 50km
        }
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.types,places.rating,places.userRatingCount,places.location,places.photos,places.editorialSummary'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Google Places API Error (SearchText):', response.status, JSON.stringify(errorData, null, 2));
      return res.status(500).json({ error: 'Failed to search places' });
    }

    recordGooglePlacesCall();

    const data = await response.json();
    res.json(data || { places: [] });
  } catch (error) {
    console.error('TextSearch route error:', error);
    res.json({ places: [] });
  }
});

router.post('/suggestions', async (req, res) => {
  try {
    const { lat, lng, radius, types } = req.body;
    if (!lat || !lng) return res.status(400).json({ error: 'Missing lat or lng' });

    if (isBudgetExceeded()) {
      return res.status(429).json({ error: 'Daily API budget exceeded', budgetExceeded: true, limitUSD: DAILY_BUDGET_USD, places: [] });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn('Missing Google Maps API Key for suggestions');
      return res.json({ places: [] });
    }

    const url = 'https://places.googleapis.com/v1/places:searchNearby';
    const includedTypes = resolveIncludedTypes(types);

    const requestBody: any = {
      includedTypes: includedTypes.slice(0, 50),
      excludedTypes: ['supermarket', 'grocery_store', 'convenience_store', 'liquor_store', 'car_repair', 'car_dealer', 'shopping_mall'],
      maxResultCount: 5,
      locationRestriction: {
        circle: {
          center: { latitude: Number(lat), longitude: Number(lng) },
          radius: Number(radius) || 500.0
        }
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.types,places.rating,places.userRatingCount,places.location,places.photos'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Google Places API Error (Suggestions):', response.status, JSON.stringify(errorData, null, 2));
      return res.json({ places: [] });
    }

    recordGooglePlacesCall();

    const data = await response.json();
    res.json(data || { places: [] });
  } catch (error) {
    console.error('Suggestions route error:', error);
    res.json({ places: [] });
  }
});

router.get('/photo', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).send('Missing photo name');

    // Photo requests are billed too and a list view can trigger dozens at once,
    // so they count against the same daily budget.
    if (isBudgetExceeded()) {
      return res.status(429).send('Daily API budget exceeded');
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).send('Missing API Key');

    const url = `https://places.googleapis.com/v1/${name}/media?key=${apiKey}&maxWidthPx=800`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch photo from Google');

    recordGooglePlacesCall();

    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Photo proxy error:', error);
    res.status(500).send('Error fetching photo');
  }
});

export default router;
