// src/hooks/usePlaces.ts
import { useState, useRef, useCallback } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { useApiTracker } from './useApiTracker';

export interface Place {
  id: string;
  displayName: { text: string };
  formattedAddress?: string;
  types: string[];
  rating: number;
  userRatingCount: number;
  editorialSummary?: { text: string };
  photos?: any[];
  regularOpeningHours?: { openNow: boolean };
  location: { latitude: number; longitude: number };
  pregeneratedNarration?: string;
}

interface CacheEntry {
  timestamp: number;
  data: Place[];
}

export function usePlaces() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [zoneName, setZoneName] = useState<string>('Unknown Zone');
  const [isLoading, setIsLoading] = useState(false);
  const [rawResults, setRawResults] = useState<any>(null);
  const { trackCall } = useApiTracker();
  
  const placesCache = useRef<Map<string, CacheEntry>>(new Map());
  const lastGeocodeLoc = useRef<{lat: number, lng: number} | null>(null);
  const lastSuggestionLoc = useRef<{lat: number, lng: number} | null>(null);

  // Shared grid-key logic: same location + radius always resolves to the same cache entry,
  // so places fetched via /nearby and suggestions fetched via /suggestions can reuse each other's cache.
  const getGridId = (lat: number, lng: number, radius: number) => {
    const mode = radius > 1000 ? 'vehicle' : 'walking';
    const gridId = `${lat.toFixed(2)}_${lng.toFixed(2)}_${mode}`;
    return { gridId, cacheKey: `${gridId}_${radius}`, mode };
  };

  // Checks local memory cache, then Firebase, for previously-fetched places at this grid location.
  // Returns null on a miss so callers know they must hit the live API.
  const getCachedPlaces = useCallback(async (gridId: string, cacheKey: string): Promise<Place[] | null> => {
    const now = Date.now();

    const localCached = placesCache.current.get(cacheKey);
    if (localCached && (now - localCached.timestamp < 300000)) {
      return localCached.data;
    }

    const gridDocRef = doc(db, 'poi_grids', gridId);
    try {
      const gridDoc = await getDoc(gridDocRef);
      if (gridDoc.exists()) {
        const data = gridDoc.data();
        const expiresAt = data.cacheExpiresAt?.toMillis() || (data.updatedAt?.toMillis() || 0) + (7 * 24 * 60 * 60 * 1000);

        if (now < expiresAt) {
          const fetchedPlaces = typeof data.places === 'string' ? JSON.parse(data.places) : data.places;
          if (fetchedPlaces && Array.isArray(fetchedPlaces) && fetchedPlaces.length > 0) {
            placesCache.current.set(cacheKey, { timestamp: now, data: fetchedPlaces });
            return fetchedPlaces;
          }
        }
      }
    } catch (error) {
      console.error("Error reading from Firebase cache", error);
      // We don't throw handleFirestoreError here because we want to fallback to the live API if read fails
    }
    return null;
  }, []);

  const fetchNearbyPlaces = useCallback(async (lat: number, lng: number, radius: number, types?: string[], currentZone?: string, force: boolean = false) => {
    const { gridId, cacheKey, mode } = getGridId(lat, lng, radius);
    const now = Date.now();

    setIsLoading(true);
    try {
      // 1. Check local memory cache, then Firebase global cache before ever touching Google/OpenAI
      if (!force) {
        const cached = await getCachedPlaces(gridId, cacheKey);
        if (cached) {
          setPlaces(cached);
          setIsLoading(false);
          return cached;
        }
      }

      // 2. Fallback to OpenAI API (now Google + OpenAI)
      const response = await fetch('/api/places/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, radius, types, zoneName: currentZone })
      });
      
      // Track the call since an actual backend hit occurred
      trackCall('googlePlaces');
      trackCall('openAI');
      
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        let errData = {};
        try { errData = JSON.parse(text); } catch(e) {}
        throw new Error((errData as any).details || (errData as any).error || 'Failed to fetch places');
      }
      
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
        setRawResults(data); // Capture raw results for debugging
      } catch(e) {
        throw new Error('Invalid JSON received');
      }
      const fetchedPlaces = data.places || [];
      
      // Save to local cache
      placesCache.current.set(cacheKey, { timestamp: now, data: fetchedPlaces });
      setPlaces(fetchedPlaces);

      // Save to Firebase global cache
      if (fetchedPlaces.length > 0) {
        try {
          const gridDocRef = doc(db, 'poi_grids', gridId);
          // Sanitize places to avoid exceeding 1MB limit and remove unnecessary data
          const sanitizedPlaces = fetchedPlaces.map((p: any) => ({
            id: p.id,
            displayName: p.displayName,
            types: p.types,
            rating: p.rating || null,
            userRatingCount: p.userRatingCount || 0,
            editorialSummary: p.editorialSummary || null,
            location: p.location,
            pregeneratedNarration: p.pregeneratedNarration || null,
            photos: p.photos ? p.photos.slice(0, 3) : [], // only keep top 3 photos to save DB space
            regularOpeningHours: p.regularOpeningHours || null
          }));
          
          // Task 3: Variable TTL based on transport mode
          const ttlDays = mode === 'walking' ? 7 : 30;
          const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

          await setDoc(gridDocRef, {
            gridId,
            cityCode: currentZone || 'Unknown',
            transportMode: mode,
            places: sanitizedPlaces, // We NO LONGER stringify this array
            updatedAt: serverTimestamp(),
            cacheExpiresAt: expiresAt, // Dynamic TTL (X=7 for walking, Y=30 for vehicles)
            lastRefreshedAt: serverTimestamp(),
            refreshPriority: mode === 'walking' ? 10 : 5 // Priority index for Cloud Functions
          }, { merge: true });
        } catch (error) {
          console.error("Error saving to Firebase cache", error);
          try {
            handleFirestoreError(error, OperationType.WRITE, `poi_grids/${gridId}`);
          } catch (handlerError) {
            console.error("Swallowed handleFirestoreError exception to return places");
          }
        }
      }

      return fetchedPlaces;
    } catch (error) {
      console.error(error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [getCachedPlaces]);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    // Only geocode if moved significantly (>50m), unless we currently have an Unknown Zone
    if (lastGeocodeLoc.current && zoneName !== 'Unknown Zone') {
      const dist = Math.sqrt(
        Math.pow(lastGeocodeLoc.current.lat - lat, 2) + 
        Math.pow(lastGeocodeLoc.current.lng - lng, 2)
      ) * 111320; // approx meters
      if (dist < 50) return zoneName;
    }

    try {
      const response = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
      if (!response.ok) throw new Error('Geocoding failed');
      
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch(e) {
        throw new Error('Invalid JSON');
      }
      setZoneName(data.zoneName);
      lastGeocodeLoc.current = { lat, lng };
      return data.zoneName;
    } catch (error) {
      console.error(error);
      return zoneName;
    }
  }, [zoneName]);

  const fetchGoogleSuggestions = useCallback(async (lat: number, lng: number, radius: number, types?: string[]) => {
    if (lastSuggestionLoc.current) {
      const dist = Math.sqrt(
        Math.pow(lastSuggestionLoc.current.lat - lat, 2) +
        Math.pow(lastSuggestionLoc.current.lng - lng, 2)
      ) * 111320;
      if (dist < 50) return; // Don't fetch if moved less than 50m
    }

    // Suggestions are just a subset of the same nearby-places grid, so check the
    // shared memory/Firebase cache first instead of always hitting Google live.
    const { gridId, cacheKey } = getGridId(lat, lng, radius);
    const cached = await getCachedPlaces(gridId, cacheKey);
    if (cached) {
      setSuggestions(cached.slice(0, 5));
      lastSuggestionLoc.current = { lat, lng };
      return;
    }

    try {
      const response = await fetch('/api/places/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, radius, types })
      });
      trackCall('googlePlaces');

      if (response.ok) {
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch(e) {
          console.warn('Invalid JSON from suggestions');
          return;
        }
        setSuggestions(data.places || []);
        lastSuggestionLoc.current = { lat, lng };
      } else {
        console.warn('Failed to fetch suggestions from server');
      }
    } catch (error) {
      console.error(error);
    }
  }, [getCachedPlaces]);

  const searchPlacesText = useCallback(async (query: string, lat?: number, lng?: number) => {
    try {
      const response = await fetch('/api/places/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, lat, lng })
      });
      trackCall('googlePlaces');
      
      if (response.ok) {
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch(e) {
          console.warn('Invalid JSON from search');
          return [];
        }
        return data.places || [];
      } else {
        console.warn('Failed to search places text');
        return [];
      }
    } catch (error) {
      console.error(error);
      return [];
    }
  }, []);

  return { places, zoneName, isLoading, rawResults, fetchNearbyPlaces, reverseGeocode, suggestions, fetchGoogleSuggestions, searchPlacesText };
}
