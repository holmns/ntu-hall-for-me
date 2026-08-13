/**
 * The hand-drawn search boundary.
 *
 * Lives in the URL as `?area=`, so it behaves like every other filter: it
 * survives a reload, it can be shared, and the back button undoes it. That
 * means the same code has to run in the browser (the map draws it) and on the
 * server (the query filters by it), so this module imports nothing.
 */

export type AreaPoint = { lat: number; lng: number };

/**
 * Kept low deliberately. A freehand drag produces hundreds of points; the
 * drawer thins them before encoding, and this is the backstop that keeps a
 * hand-edited URL from turning into a 10KB point-in-polygon loop.
 */
export const MAX_AREA_POINTS = 80;

/** Roughly Singapore plus a margin. Anything outside is a malformed URL. */
const LAT_RANGE = [1.0, 1.7] as const;
const LNG_RANGE = [103.3, 104.3] as const;

/** ~1m of precision, which is far finer than anyone can draw with a mouse. */
function round(value: number): string {
  return value.toFixed(5);
}

export function encodeArea(points: AreaPoint[]): string {
  return points.map((p) => `${round(p.lat)},${round(p.lng)}`).join(";");
}

/**
 * Null for anything that is not a usable polygon. A bad `area` param should
 * drop the boundary and show every room, never throw the results page away.
 */
export function decodeArea(value: string | null | undefined): AreaPoint[] | null {
  if (!value) return null;

  const points: AreaPoint[] = [];
  for (const pair of value.split(";")) {
    const [rawLat, rawLng] = pair.split(",");
    const lat = Number(rawLat);
    const lng = Number(rawLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < LAT_RANGE[0] || lat > LAT_RANGE[1]) return null;
    if (lng < LNG_RANGE[0] || lng > LNG_RANGE[1]) return null;
    points.push({ lat, lng });
    if (points.length > MAX_AREA_POINTS) return null;
  }

  // Two points are a line, which encloses nothing.
  return points.length >= 3 ? points : null;
}

export function areaBounds(points: AreaPoint[]) {
  return {
    north: Math.max(...points.map((p) => p.lat)),
    south: Math.min(...points.map((p) => p.lat)),
    east: Math.max(...points.map((p) => p.lng)),
    west: Math.min(...points.map((p) => p.lng)),
  };
}

/**
 * Ray casting. Over a few hundred metres of Singapore the difference between
 * planar and spherical geometry is far below the precision of a mouse drag, so
 * lat/lng are treated as plain x/y.
 *
 * Points exactly on an edge are not guaranteed either way, which does not
 * matter for a boundary someone sketched by hand.
 */
export function isInsideArea(point: AreaPoint, polygon: AreaPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const straddles = a.lat > point.lat !== b.lat > point.lat;
    if (!straddles) continue;
    const x =
      ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (point.lng < x) inside = !inside;
  }
  return inside;
}
