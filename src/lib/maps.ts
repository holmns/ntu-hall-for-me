/**
 * Google Maps integration. Server-side only by convention: it is imported from
 * route handlers, server actions and the seed script, never from a client
 * component. GOOGLE_MAPS_API_KEY has no NEXT_PUBLIC_ prefix, so Next.js will
 * not inline it into a browser bundle. (No `server-only` import here because
 * the seed script runs this module outside the Next.js bundler.)
 *
 * GOOGLE_MAPS_API_KEY is required. There is no offline address book and no
 * straight-line commute estimate behind these calls: a listing is only created
 * with real Places and Distance Matrix data, or not at all.
 */
import type { ListingCategory } from "@/generated/prisma/enums";
import { NTU_CAMPUS, SEARCH_BIAS_RADIUS_M } from "./constants";

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
};

/**
 * Read per call rather than at module load: the seed script loads .env after
 * importing this module, and a stale undefined would be baked in.
 */
function mapsKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "GOOGLE_MAPS_API_KEY is not set. Address lookup and the commute to campus require it - see .env.example.",
    );
  }
  return key;
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

// ---------------------------------------------------------------------------
// Places Autocomplete
// ---------------------------------------------------------------------------

/**
 * Autocomplete runs server-side (Places API New) so the Maps key is never
 * shipped to the browser and we control the dropdown markup. Throws if the key
 * is missing or the API errors, rather than serving a canned address list.
 */
export async function autocompletePlaces(
  input: string,
  sessionToken?: string,
): Promise<PlaceSuggestion[]> {
  const query = input.trim();
  if (query.length < 2) return [];

  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": mapsKey(),
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

  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
    .map((p) => ({
      placeId: p.placeId,
      primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondary: p.structuredFormat?.secondaryText?.text ?? "",
    }));
}

// ---------------------------------------------------------------------------
// Nearby search (the browse map's points-of-interest layers)
// ---------------------------------------------------------------------------

export type NearbyPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

/** Widest circle a POI layer may ask for. Keeps one toggle to one cheap call. */
export const MAX_NEARBY_RADIUS_M = 3000;

/**
 * Places nearby search, used by the map's Restaurants and Transit layers.
 *
 * Bounded on purpose: one call per layer per area, capped result count, capped
 * radius. This is a browsing nicety on a paid API, so it must never turn into
 * a request per pan.
 */
export async function searchNearbyPlaces(
  center: LatLng,
  radiusM: number,
  includedTypes: string[],
  maxResultCount = 20,
): Promise<NearbyPlace[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": mapsKey(),
      "X-Goog-FieldMask": "places.id,places.displayName,places.location",
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount,
      rankPreference: "POPULARITY",
      locationRestriction: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: Math.min(Math.max(radiusM, 200), MAX_NEARBY_RADIUS_M),
        },
      },
    }),
  });

  if (!res.ok) throw new Error(`Places nearby search failed: ${res.status}`);
  const data = (await res.json()) as {
    places?: {
      id?: string;
      displayName?: { text?: string };
      location?: { latitude: number; longitude: number };
    }[];
  };

  return (data.places ?? [])
    .filter((p) => p.id && p.location)
    .map((p) => ({
      id: p.id!,
      name: p.displayName?.text ?? "",
      lat: p.location!.latitude,
      lng: p.location!.longitude,
    }));
}

/** Null only when Places has no location for the id. Throws on API failure. */
export async function getPlaceDetail(
  placeId: string,
  sessionToken?: string,
): Promise<PlaceDetail | null> {
  const url = new URL(`https://places.googleapis.com/v1/places/${placeId}`);
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": mapsKey(),
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
 *
 * Every mode must resolve. A partial result would be written to the row and
 * shown to seekers as fact, and 0 already means "on campus", so a failed mode
 * fails the whole call instead.
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
    };
  }

  const modes = ["walking", "transit", "driving"] as const;
  const [walking, transit, driving] = await Promise.all(
    modes.map((mode) => distanceMatrix(point, mode)),
  );

  if (!walking || !transit || !driving) {
    const missing = modes.filter(
      (_, i) => ![walking, transit, driving][i],
    );
    throw new Error(
      `Distance Matrix returned no route to campus for: ${missing.join(", ")}`,
    );
  }

  return {
    distanceMeters: driving.distanceMeters || walking.distanceMeters,
    walkingMin: walking.minutes,
    transitMin: transit.minutes,
    drivingMin: driving.minutes,
  };
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
  url.searchParams.set("key", mapsKey());

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
