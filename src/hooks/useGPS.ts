// src/hooks/useGPS.ts
import { useState, useEffect, useRef } from 'react';
import { calculateDistance, calculateBearing } from '../utils/geo';

export interface LocationData {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number; // m/s
  heading: number | null; // degrees
  timestamp: number;
}

export function useGPS() {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWaiting, setIsWaiting] = useState(true);
  const prevLocRef = useRef<LocationData | null>(null);

  const startTracking = () => {
    setIsWaiting(true);
    setError(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      setIsWaiting(false);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy, speed, heading } = position.coords;
        
        const newLoc: LocationData = {
          lat: latitude,
          lng: longitude,
          accuracy,
          speed: speed || 0,
          heading: heading,
          timestamp: position.timestamp
        };

        // If speed/heading not provided by device, calculate manually
        if (prevLocRef.current && (!speed || heading === null)) {
          const prev = prevLocRef.current;
          const dist = calculateDistance(prev.lat, prev.lng, newLoc.lat, newLoc.lng);
          const timeDiff = (newLoc.timestamp - prev.timestamp) / 1000; // seconds
          
          if (timeDiff > 0) {
            newLoc.speed = speed !== null ? speed : dist / timeDiff;
          }
          if (dist > 1) { // Only update heading if moved more than 1 meter
            newLoc.heading = heading !== null ? heading : calculateBearing(prev.lat, prev.lng, newLoc.lat, newLoc.lng);
          } else {
            newLoc.heading = prev.heading;
          }
        }

        prevLocRef.current = newLoc;
        setLocation(newLoc);
        setIsWaiting(false);
        setError(null);
      },
      (err) => {
        setIsWaiting(false);
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError('Location permission denied. Please click the lock icon in your browser address bar to allow location access, then click Retry. If you are viewing this inside a preview window, you may need to open the app in a new tab to grant permissions.');
            break;
          case err.POSITION_UNAVAILABLE:
            setError('Location information is unavailable.');
            break;
          case err.TIMEOUT:
            setError('The request to get user location timed out.');
            break;
          default:
            setError('An unknown error occurred getting location.');
            break;
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  };

  useEffect(() => {
    const cleanup = startTracking();
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return { location, error, isWaiting, retry: startTracking };
}
