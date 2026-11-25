import type { LatLng } from './types';

/**
 * TRAVEL TIME
 * -----------
 * The scheduler calls `estimateTravel` between consecutive jobs.
 * It is a straight-line (haversine) distance times an assumed urban
 * speed, plus a few minutes to get in the building. It is not live
 * traffic.
 *
 * GOOGLE MAPS DISTANCE MATRIX PLUG-IN
 * -----------------------------------
 * This is the spot to replace the estimate with driving/transit times.
 * Distance Matrix is a server API: the browser should not call it
 * (CORS, and the key would be public). A small backend would request:
 *
 *   GET https://maps.googleapis.com/maps/api/distancematrix/json
 *     ?origins={lat},{lng}
 *     &destinations={lat},{lng}
 *     &mode=transit
 *     &units=metric
 *     &key=GOOGLE_MAPS_API_KEY
 *
 * Use `rows[0].elements[0].duration.value` (seconds) as the moving
 * time, then add ACCESS_BUFFER_MIN for the doorman and the stairs.
 * If the key is missing or the request fails, keep `estimateTravel`.
 *
 * `GOOGLE_DISTANCE_MATRIX` names that endpoint so the swap is obvious.
 * Nothing in the prototype calls Google.
 */
export const GOOGLE_DISTANCE_MATRIX = {
  endpoint: 'https://maps.googleapis.com/maps/api/distancematrix/json',
  mode: 'transit',
  units: 'metric',
  durationPath: 'rows[0].elements[0].duration.value',
  fallback: 'estimateTravel',
  envKey: 'VITE_GOOGLE_MAPS_API_KEY',
} as const;

/** Rough Manhattan/Brooklyn pace: walk + a short train, not a highway. */
export const URBAN_KMH = 15;
/** Doorman, buzzer, shoes off. Added on top of moving time. */
export const ACCESS_BUFFER_MIN = 5;

export interface TravelEstimate {
  km: number;
  minutes: number;
  bufferMinutes: number;
  method: 'haversine';
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function estimateTravel(a: LatLng, b: LatLng): TravelEstimate {
  const km = haversineKm(a, b);
  if (km < 0.08) {
    return { km: 0, minutes: 0, bufferMinutes: 0, method: 'haversine' };
  }
  const minutes = Math.max(4, Math.round((km / URBAN_KMH) * 60));
  return {
    km,
    minutes,
    bufferMinutes: minutes + ACCESS_BUFFER_MIN,
    method: 'haversine',
  };
}

export function formatKm(km: number): string {
  if (km < 0.1) return 'same block';
  return `${km.toFixed(1)} km`;
}
