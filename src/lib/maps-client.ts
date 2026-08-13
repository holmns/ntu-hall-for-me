/**
 * Browser-side Google Maps JS API loader, shared by every map component.
 *
 * Loads via the `&callback=` parameter rather than the script's `onload`:
 * with `loading=async`, onload fires before `google.maps.Map` exists, so
 * constructing a map there throws. Google only guarantees the namespace is
 * populated once the callback fires. Do not switch this to `script.onload`.
 *
 * Markers use the `marker` library's AdvancedMarkerElement (the legacy
 * google.maps.Marker is deprecated). Advanced markers only render on a map
 * that has a Map ID, so DEFAULT_MAP_ID falls back to Google's public demo
 * ID when NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID is not configured.
 */
type MapCtor = new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
type PathOverlayCtor = new (opts: Record<string, unknown>) => GPathOverlay;

export type GLatLng = { lat: () => number; lng: () => number };

export type GLatLngBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

/** Handle returned by addListener. Draw mode has to unsubscribe when it ends. */
export type GMapsListener = { remove: () => void };

/**
 * Opaque handle to a registered map type. The app only ever hands one straight
 * back to the map it came from, so there is nothing to model on it.
 */
export type GStyledMapType = { readonly __brand: "StyledMapType" };

export type GMap = {
  addListener: (
    event: string,
    handler: (e: { latLng: GLatLng }) => void,
  ) => GMapsListener;
  setOptions: (opts: Record<string, unknown>) => void;
  panTo: (pos: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  getZoom: () => number | undefined;
  /** "roadmap" | "satellite" | "hybrid" | "terrain", or a registered id. */
  setMapTypeId: (id: string) => void;
  /**
   * Custom map types, keyed by the id `setMapTypeId` will be given. This is
   * the only way to restyle a map that has a `mapId`: the `styles` option is
   * ignored outright while one is present, and the mapId is what makes
   * advanced markers render at all.
   */
  mapTypes: { set: (id: string, type: GStyledMapType) => void };
  /** Undefined until the map has laid out at least once. */
  getBounds: () =>
    | { getNorthEast: () => GLatLng; getSouthWest: () => GLatLng }
    | undefined;
  fitBounds: (
    bounds: GLatLngBounds,
    padding?: number | { top: number; right: number; bottom: number; left: number },
  ) => void;
};

/** Polyline and Polygon share the parts this app uses. */
export type GPathOverlay = {
  setMap: (map: GMap | null) => void;
  setPath: (path: { lat: number; lng: number }[]) => void;
};

/**
 * AdvancedMarkerElement is a custom element, so taps arrive as the DOM event
 * `gmp-click`. Listening for plain `click` through addListener still works but
 * the API logs a deprecation warning for it.
 */
export type GAdvancedMarker = {
  position: { lat: number; lng: number } | GLatLng | null;
  map: GMap | null;
  zIndex: number | null;
  addListener: (event: string, handler: () => void) => void;
  addEventListener: (event: "gmp-click", handler: () => void) => void;
};

type AdvancedMarkerCtor = new (opts: {
  map?: GMap | null;
  position?: { lat: number; lng: number } | null;
  title?: string;
  content?: HTMLElement;
  gmpDraggable?: boolean;
  /** Advanced markers ignore click listeners unless this is set. */
  gmpClickable?: boolean;
  zIndex?: number;
}) => GAdvancedMarker;

type PinElementCtor = new (opts: {
  background?: string;
  borderColor?: string;
  glyphColor?: string;
  scale?: number;
}) => { element: HTMLElement };

type StyledMapTypeCtor = new (
  styles: Record<string, unknown>[],
  opts?: { name?: string },
) => GStyledMapType;

export type MapsNamespace = {
  Map: MapCtor;
  Polygon: PathOverlayCtor;
  Polyline: PathOverlayCtor;
  StyledMapType: StyledMapTypeCtor;
  marker: {
    AdvancedMarkerElement: AdvancedMarkerCtor;
    PinElement: PinElementCtor;
  };
};

export const DEFAULT_MAP_ID =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || "DEMO_MAP_ID";

function getMapsNamespace(): MapsNamespace | null {
  const ns = (globalThis as { google?: { maps?: MapsNamespace } }).google?.maps;
  return ns?.Map && ns.StyledMapType && ns.marker?.AdvancedMarkerElement
    ? ns
    : null;
}

const CALLBACK_NAME = "__ntuRoomFinderMapsReady";
let mapsLoader: Promise<void> | null = null;

function loadMapsApi(apiKey: string): Promise<void> {
  if (mapsLoader) return mapsLoader;
  mapsLoader = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (getMapsNamespace()) return resolve();

    const timer = setTimeout(
      () => reject(new Error("Google Maps timed out")),
      15_000,
    );
    (window as unknown as Record<string, unknown>)[CALLBACK_NAME] = () => {
      clearTimeout(timer);
      resolve();
    };

    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&libraries=maps,marker&loading=async&callback=${CALLBACK_NAME}`;
    script.async = true;
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Failed to load Google Maps"));
    };
    document.head.appendChild(script);
  });
  return mapsLoader;
}

/**
 * Great-circle distance, duplicated from `maps.ts` rather than imported:
 * that module reads the server-only Maps key and must never reach a client
 * bundle.
 */
export function metersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 *
      Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat));
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** AdvancedMarkerElement#position is a LatLng after a drag, a plain literal otherwise. */
export function toLatLngLiteral(
  pos: { lat: number; lng: number } | GLatLng | null,
): { lat: number; lng: number } | null {
  if (!pos) return null;
  if (typeof (pos as GLatLng).lat === "function") {
    const g = pos as GLatLng;
    return { lat: g.lat(), lng: g.lng() };
  }
  return pos as { lat: number; lng: number };
}

export async function loadMapClasses(apiKey: string): Promise<{
  Map: MapCtor;
  Polygon: PathOverlayCtor;
  Polyline: PathOverlayCtor;
  StyledMapType: StyledMapTypeCtor;
  AdvancedMarkerElement: AdvancedMarkerCtor;
  PinElement: PinElementCtor;
}> {
  await loadMapsApi(apiKey);
  const ns = getMapsNamespace();
  if (!ns) throw new Error("Maps namespace did not initialise");
  return {
    Map: ns.Map,
    Polygon: ns.Polygon,
    Polyline: ns.Polyline,
    StyledMapType: ns.StyledMapType,
    AdvancedMarkerElement: ns.marker.AdvancedMarkerElement,
    PinElement: ns.marker.PinElement,
  };
}
