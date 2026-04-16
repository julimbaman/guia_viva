import { Router } from 'express';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    if (!lat || !lng) {
      res.status(400).json({ error: 'Missing lat or lng' });
      return;
    }

    const apiKey = process.env.GOOGLE_GEOCODING_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Missing Google Maps API Key' });
      return;
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('Geocoding API returned status:', data.status, data.error_message);
      res.status(400).json({ error: data.error_message || 'Geocoding failed', status: data.status });
      return;
    }

    // Extract the best match. Try to find a neighborhood or locality first, fallback to the most specific address.
    let bestMatch = data.results.find((r: any) => r.types.includes('neighborhood') || r.types.includes('sublocality'));
    if (!bestMatch) bestMatch = data.results.find((r: any) => r.types.includes('locality'));
    if (!bestMatch) bestMatch = data.results[0]; // Fallback to whatever is first (usually street address)

    // Clean up the formatted address (e.g., remove country if it's too long)
    let zoneName = bestMatch ? bestMatch.formatted_address : 'Unknown Zone';
    // Often formatted_address is "Neighborhood, City, Country". Let's just take the first part for brevity if it has commas.
    if (zoneName.includes(',')) {
      zoneName = zoneName.split(',')[0];
    }

    res.json({ zoneName, results: data.results });
  } catch (error) {
    console.error('Geocode route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
