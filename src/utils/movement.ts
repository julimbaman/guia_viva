// src/utils/movement.ts

export type TransportMode = 'stationary' | 'walking' | 'running' | 'vehicle';

export function getTransportMode(speedMetersPerSecond: number): TransportMode {
  if (speedMetersPerSecond < 0.3) return 'stationary';
  if (speedMetersPerSecond <= 2.0) return 'walking';
  if (speedMetersPerSecond <= 4.0) return 'running';
  return 'vehicle';
}

export function getSearchRadius(mode: TransportMode): number {
  switch (mode) {
    case 'stationary': return 200;
    case 'walking': return 500;
    case 'running': return 1000;
    case 'vehicle': return 2000;
    default: return 500;
  }
}

export function getNarrationInterval(mode: TransportMode, baseInterval: number): number {
  // Adjust interval based on speed
  switch (mode) {
    case 'stationary': return baseInterval * 1.5; // Less frequent if not moving
    case 'walking': return baseInterval;
    case 'running': return baseInterval * 0.8;
    case 'vehicle': return Math.max(15, baseInterval * 0.5); // More frequent if moving fast, min 15s
    default: return baseInterval;
  }
}
