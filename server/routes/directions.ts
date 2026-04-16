import { Router } from 'express';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { origin, destination, mode } = req.query;
    
    if (!origin || !destination) {
      res.status(400).json({ error: 'Missing origin or destination' });
      return;
    }

    const apiKey = process.env.GOOGLE_DIRECTIONS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Missing Google Maps API Key' });
      return;
    }

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=${mode || 'walking'}&key=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      res.status(400).json({ error: data.error_message || 'Directions failed' });
      return;
    }

    res.json(data);
  } catch (error) {
    console.error('Directions route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
