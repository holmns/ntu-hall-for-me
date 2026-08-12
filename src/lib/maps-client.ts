/**
 * Browser-side Google Maps JS API loader, shared by every map component.
 *
 * Loads via the `&callback=` parameter rather than the script's `onload`:
 * with `loading=async`, onload fires before `google.maps.Map` exists, so
 * constructing a map there throws. Google only guarantees the namespace is
 * populated once the callback fires. Do not switch this to `script.onload`.
 */
type MapCtor = new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
type OverlayCtor = new (opts: Record<string, unknown>) => GOverlay;

export type GLatLng = { lat: () => number; lng: () => number };

export type GMap = {
  addListener: (event: string, handler: (e: { latLng: GLatLng }) => void) => void;
  panTo: (pos: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
};

export type GOverlay = {
  setMap: (map: GMap | null) => void;
  setPosition: (pos: { lat: number; lng: number }) => void;
  addListener: (event: string, handler: (e: { latLng: GLatLng }) => void) => void;
};

export type MapsNamespace = {
  Map: MapCtor;
  Circle: OverlayCtor;
  Marker: OverlayCtor;
  SymbolPath: { CIRCLE: unknown };
};

function getMapsNamespace(): MapsNamespace | null {
  const ns = (globalThis as { google?: { maps?: MapsNamespace } }).google?.maps;
  return ns?.Map ? ns : null;
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

export async function loadMapClasses(apiKey: string): Promise<MapsNamespace> {
  await loadMapsApi(apiKey);
  const ns = getMapsNamespace();
  if (!ns) throw new Error("Maps namespace did not initialise");
  return ns;
}
