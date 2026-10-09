/** Distance and venue geofence — the server (attendances_server_checks) has the final say. */

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface FenceResult {
  inside: boolean;
  distanceM: number;
}

/** Preview for the SPG before clock-in; a mocked position is never inside. */
export function venueFence(
  venue: { lat: number; lng: number; radiusM: number },
  pos: { lat: number; lng: number },
  mocked: boolean,
): FenceResult {
  const distanceM = Math.round(haversineM(venue, pos));
  return { inside: !mocked && distanceM <= venue.radiusM, distanceM };
}
