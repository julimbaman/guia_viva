// src/utils/geo.ts

// Haversine formula to calculate distance between two points in meters
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Calculate bearing (angle) from point 1 to point 2 in degrees (0-360)
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const λ1 = (lon1 * Math.PI) / 180;
  const λ2 = (lon2 * Math.PI) / 180;

  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  const θ = Math.atan2(y, x);
  
  return ((θ * 180) / Math.PI + 360) % 360; // in degrees
}

// Convert bearing to cardinal direction
export function getCardinalDirection(bearing: number): string {
  const directions = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
  const index = Math.round(((bearing %= 360) < 0 ? bearing + 360 : bearing) / 45) % 8;
  return directions[index];
}

// Get relative direction based on user heading and target bearing
export function getRelativeDirection(userHeading: number | null, targetBearing: number): string {
  if (userHeading === null) return 'nearby';
  
  let diff = targetBearing - userHeading;
  if (diff < -180) diff += 360;
  if (diff > 180) diff -= 360;

  if (diff > -45 && diff <= 45) return 'straight ahead';
  if (diff > 45 && diff <= 135) return 'to your right';
  if (diff > -135 && diff <= -45) return 'to your left';
  return 'behind you';
}

// Project future position based on current lat/lng, speed (m/s), heading (degrees), and time (seconds)
export function projectFuturePosition(lat: number, lng: number, speed: number, heading: number, timeSeconds: number) {
  const distance = speed * timeSeconds; // meters
  const R = 6371e3; // Earth's radius in meters
  const bearingRad = (heading * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distance / R) +
    Math.cos(lat1) * Math.sin(distance / R) * Math.cos(bearingRad)
  );
  
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearingRad) * Math.sin(distance / R) * Math.cos(lat1),
    Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (lng2 * 180) / Math.PI
  };
}
