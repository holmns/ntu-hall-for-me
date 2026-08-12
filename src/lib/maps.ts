/**
 * Google Maps integration. Server-side only by convention: it is imported from
 * route handlers, server actions and the seed script, never from a client
 * component. GOOGLE_MAPS_API_KEY has no NEXT_PUBLIC_ prefix, so Next.js will
 * not inline it into a browser bundle. (No `server-only` import here because
 * the seed script runs this module outside the Next.js bundler.)
 */
import type { ListingCategory } from "@/generated/prisma/enums";
import { NTU_CAMPUS, SEARCH_BIAS_RADIUS_M } from "./constants";
import { NTU_AREA_PLACES } from "./ntu-area-places";

export type LatLng = { lat: number; lng: number };

export type PlaceSuggestion = {
  placeId: string;
  primary: string;
  secondary: string;
};

export type PlaceDetail = {
  placeId: string;
  address: string;
  lat: number;
  lng: number;
};

export type Commute = {
  distanceMeters: number;
  walkingMin: number;
  transitMin: number;
  drivingMin: number;
  /** True when values came from the Distance Matrix API rather than the offline estimate. */
  fromApi: boolean;
};

const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY?.trim();

export function hasMapsKey(): boolean {
  return Boolean(MAPS_KEY);
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * Public-safe coordinates. Offsets the true point by a deterministic distance
 * so the map shows the neighbourhood without pinpointing the unit.
 *
 * Offset is 250-550m and paired with a 600m display circle (see ApproxMap), so
 * the true location sits somewhere inside a roughly 1km-wide area. An earlier
 * 180-320m offset was too tight for Singapore HDB estates, where that radius
 * often narrows to two or three blocks. Deterministic on purpose: a circle
 * that jitters on every render would leak the centre through averaging.
 */
export function approximateLocation(point: LatLng, seed: string): LatLng {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const angle = ((hash >>> 0) % 360) * (Math.PI / 180);
  const offsetM = 250 + ((hash >>> 9) % 300); // 250-550m
  const dLat = (offsetM * Math.cos(angle)) / 111_320;
  const dLng =
    (offsetM * Math.sin(angle)) /
    (111_320 * Math.cos((point.lat * Math.PI) / 180));
  return {
    lat: Number((point.lat + dLat).toFixed(5)),
    lng: Number((point.lng + dLng).toFixed(5)),
  };
}

// ---------------------------------------------------------------------------
// Places Autocomplete
// ---------------------------------------------------------------------------

/**
 * Autocomplete runs server-side (Places API New) so the Maps key is never
 * shipped to the browser and we control the dropdown markup. Without a key it
 * falls back to a small local dataset of NTU-area addresses, which keeps the
 * whole provider flow demoable offline.
 */
export async function autocompletePlaces(
  input: string,
  sessionToken?: string,
): Promise<{ suggestions: PlaceSuggestion[]; fromApi: boolean }> {
  const query = input.trim();
  if (query.length < 2) return { suggestions: [], fromApi: false };

  if (!MAPS_KEY) return { suggestions: localSuggest(query), fromApi: false };

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": MAPS_KEY,
      },
      body: JSON.stringify({
        input: query,
        includedRegionCodes: ["sg"],
        locationBias: {
          circle: {
            center: {
              latitude: NTU_CAMPUS.lat,
              longitude: NTU_CAMPUS.lng,
            },
            radius: SEARCH_BIAS_RADIUS_M,
          },
        },
        ...(sessionToken ? { sessionToken } : {}),
      }),
    });

    if (!res.ok) throw new Error(`Places autocomplete failed: ${res.status}`);
    const data = (await res.json()) as {
      suggestions?: {
        placePrediction?: {
          placeId: string;
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
          text?: { text?: string };
        };
      }[];
    };

    const suggestions = (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
      .map((p) => ({
        placeId: p.placeId,
        primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        secondary: p.structuredFormat?.secondaryText?.text ?? "",
      }));

    return { suggestions, fromApi: true };
  } catch (error) {
    console.error("[maps] autocomplete fell back to local data:", error);
    return { suggestions: localSuggest(query), fromApi: false };
  }
}

export async function getPlaceDetail(
  placeId: string,
  sessionToken?: string,
): Promise<PlaceDetail | null> {
  if (placeId.startsWith("local:")) return localDetail(placeId);
  if (!MAPS_KEY) return null;

  try {
    const url = new URL(`https://places.googleapis.com/v1/places/${placeId}`);
    if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
    const res = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": MAPS_KEY,
        "X-Goog-FieldMask": "id,formattedAddress,location",
      },
    });
    if (!res.ok) throw new Error(`Place details failed: ${res.status}`);
    const data = (await res.json()) as {
      id: string;
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
    };
    if (!data.location) return null;
    return {
      placeId: data.id,
      address: data.formattedAddress ?? "",
      lat: data.location.latitude,
      lng: data.location.longitude,
    };
  } catch (error) {
    console.error("[maps] place details failed:", error);
    return null;
  }
}

function localSuggest(query: string): PlaceSuggestion[] {
  const q = query.toLowerCase();
  return NTU_AREA_PLACES.filter(
    (p) =>
      p.address.toLowerCase().includes(q) || p.area.toLowerCase().includes(q),
  )
    .slice(0, 6)
    .map((p) => ({
      placeId: `local:${p.id}`,
      primary: p.address.split(",")[0],
      secondary: p.address.split(",").slice(1).join(",").trim() || p.area,
    }));
}

function localDetail(placeId: string): PlaceDetail | null {
  const id = placeId.replace("local:", "");
  const place = NTU_AREA_PLACES.find((p) => p.id === id);
  if (!place) return null;
  return {
    placeId,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
  };
}

// ---------------------------------------------------------------------------
// Distance Matrix
// ---------------------------------------------------------------------------

/**
 * Called ONCE when a listing is created, then cached on the row. Search must
 * never call this - it reads the stored columns.
 *
 * On-campus listings are already on campus: they get zeroed commute values and
 * are excluded from distance-based ranking so they cannot auto-dominate.
 */
export async function computeCommute(
  point: LatLng,
  category: ListingCategory,
): Promise<Commute> {
  if (category === "ON_CAMPUS") {
    return {
      distanceMeters: 0,
      walkingMin: 0,
      transitMin: 0,
      drivingMin: 0,
      fromApi: false,
    };
  }

  const straightLine = haversineMeters(point, NTU_CAMPUS);

  if (!MAPS_KEY) return estimateCommute(straightLine);

  try {
    const modes = ["walking", "transit", "driving"] as const;
    const results = await Promise.all(
      modes.map((mode) => distanceMatrix(point, mode)),
    );
    const [walking, transit, driving] = results;
    if (!walking && !transit && !driving) return estimateCommute(straightLine);

    const fallback = estimateCommute(straightLine);
    return {
      distanceMeters: driving?.distanceMeters ?? walking?.distanceMeters ?? fallback.distanceMeters,
      walkingMin: walking?.minutes ?? fallback.walkingMin,
      transitMin: transit?.minutes ?? fallback.transitMin,
      drivingMin: driving?.minutes ?? fallback.drivingMin,
      fromApi: true,
    };
  } catch (error) {
    console.error("[maps] distance matrix fell back to estimate:", error);
    return estimateCommute(straightLine);
  }
}

async function distanceMatrix(
  origin: LatLng,
  mode: "walking" | "transit" | "driving",
): Promise<{ minutes: number; distanceMeters: number } | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", `${origin.lat},${origin.lng}`);
  url.searchParams.set(
    "destinations",
    `${NTU_CAMPUS.lat},${NTU_CAMPUS.lng}`,
  );
  url.searchParams.set("mode", mode);
  url.searchParams.set("region", "sg");
  url.searchParams.set("key", MAPS_KEY!);

  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    rows?: {
      elements?: {
        status?: string;
        duration?: { value: number };
        distance?: { value: number };
      }[];
    }[];
  };
  const element = data.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK" || !element.duration) return null;
  return {
    minutes: Math.max(1, Math.round(element.duration.value / 60)),
    distanceMeters: element.distance?.value ?? 0,
  };
}

/**
 * Offline estimate used when GOOGLE_MAPS_API_KEY is absent or the API errors.
 * Road distance is roughly 1.3x straight-line in this part of Singapore.
 */
export function estimateCommute(straightLineMeters: number): Commute {
  const roadMeters = Math.round(straightLineMeters * 1.3);
  const walkingMin = Math.max(1, Math.round(roadMeters / 80)); // ~4.8 km/h
  const drivingMin = Math.max(3, Math.round(roadMeters / 650) + 4); // ~39 km/h + parking
  const transitMin = Math.max(5, Math.round(roadMeters / 320) + 7); // bus ~19 km/h + wait
  return {
    distanceMeters: roadMeters,
    walkingMin,
    transitMin,
    drivingMin,
    fromApi: false,
  };
}
