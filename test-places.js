import dotenv from 'dotenv';
dotenv.config();

const test = async () => {
    const lat = 4.67;
    const lng = -74.06;
    const radius = 500;
    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;

    if (!googleApiKey) {
        console.error('No API KEY!');
        return;
    }

    const searchUrl = 'https://places.googleapis.com/v1/places:searchNearby';
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

    const data = await googleRes.json();
    console.log(JSON.stringify(data, null, 2));
}

test();
