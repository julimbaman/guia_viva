import { Router } from 'express';
import OpenAI from 'openai';

const router = Router();

router.post('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius, types, zoneName } = req.body;
    
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Missing lat or lng' });
    }

    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!googleApiKey) {
      return res.status(500).json({ error: 'Missing Google Maps API Key' });
    }

    // 1. Fetch real places from Google Places API
    const searchUrl = 'https://places.googleapis.com/v1/places:searchNearby';
    
    // Map frontend interests to valid Google Places types
    const validGoogleTypes = ['tourist_attraction', 'historical_landmark', 'museum', 'park', 'church', 'art_gallery', 'restaurant', 'cafe'];
    
    const requestBody = {
      includedTypes: validGoogleTypes,
      maxResultCount: 10,
      locationRestriction: {
        circle: {
          center: { latitude: Number(lat), longitude: Number(lng) },
          radius: Number(radius) || 500.0
        }
      }
    };

    const googleRes = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googleApiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.types,places.rating,places.userRatingCount,places.location,places.photos,places.editorialSummary,places.regularOpeningHours'
      },
      body: JSON.stringify(requestBody)
    });

    if (!googleRes.ok) {
      const errorData = await googleRes.json().catch(() => ({}));
      console.error('Google Places API Error (Nearby):', googleRes.status, JSON.stringify(errorData, null, 2));
      return res.status(500).json({ 
        error: 'Failed to fetch places from Google', 
        details: errorData.error?.message || JSON.stringify(errorData) 
      });
    }

    const googleData = await googleRes.json();
    let places = googleData.places || [];

    if (places.length === 0) {
      return res.json({ places: [] });
    }

    // 2. Generate narrations for the top 5 places using OpenAI
    const topPlaces = places.slice(0, 5);
    const openaiApiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
    
    if (openaiApiKey) {
      try {
        const openai = new OpenAI({
          apiKey: openaiApiKey,
          ...(process.env.OPENAI_API_KEY ? {} : { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' })
        });
        const model = process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || 'gpt-4o') : 'gemini-2.5-pro';

        const placesContext = topPlaces.map((p: any) => ({
          id: p.id,
          name: p.displayName?.text,
          types: p.types,
          summary: p.editorialSummary?.text,
          schedule: p.regularOpeningHours?.weekdayDescriptions || 'Not available'
        }));

        const prompt = `You are an expert, passionate tour guide who speaks in Colombian Spanish.
I am at coordinates latitude ${lat}, longitude ${lng}${zoneName && zoneName !== 'Unknown Zone' ? ` in ${zoneName}` : ''}.
Here are some real nearby places:
${JSON.stringify(placesContext, null, 2)}

Please generate a conversational narration in Colombian Spanish for each place, including a quirky or historical fact, as if you were a tour guide pointing it out.
IMPORTANT RULES:
1. If the place is historical, cultural, or a museum, provide a slightly longer, more detailed explanation (3-4 sentences). Otherwise, keep it to 2-3 sentences.
2. If the schedule is provided and adds value, mention it generally (e.g., "Abre sus puertas de martes a domingo..."). DO NOT say "está cerrado ahora" or "está abierto" because this text will be cached for 7 days.
Return ONLY a valid JSON object where keys are the place IDs and values are the narration strings. Do not include markdown formatting.`;

        const completion = await openai.chat.completions.create({
          model: model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          response_format: { type: "json_object" }
        });

        let content = completion.choices[0]?.message?.content?.trim() || '{}';
        const match = content.match(/\{[\s\S]*\}/);
        if (match) content = match[0];

        const narrations = JSON.parse(content);

        // Attach narrations to places
        places = places.map((p: any) => ({
          ...p,
          pregeneratedNarration: narrations[p.id] || null
        }));

      } catch (aiError) {
        console.error('Failed to generate narrations:', aiError);
        // Continue without pregenerated narrations if AI fails
      }
    }

    res.json({ places });
  } catch (error: any) {
    console.error('Places route error:', error.message || error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

router.post('/suggestions', async (req, res) => {
  try {
    const { lat, lng, radius } = req.body;
    if (!lat || !lng) return res.status(400).json({ error: 'Missing lat or lng' });

    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn('Missing Google Maps API Key for suggestions');
      return res.json({ places: [] });
    }

    const url = 'https://places.googleapis.com/v1/places:searchNearby';
    const requestBody = {
      includedTypes: ['tourist_attraction', 'restaurant', 'cafe', 'park', 'museum', 'historical_landmark'],
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

    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).send('Missing API Key');

    const url = `https://places.googleapis.com/v1/${name}/media?key=${apiKey}&maxWidthPx=800`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch photo from Google');

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
