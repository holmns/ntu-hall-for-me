import { NextResponse } from "next/server";

import {
  haversineMeters,
  MAX_NEARBY_RADIUS_M,
  searchNearbyPlaces,
} from "@/lib/maps";
import { getCurrentUser } from "@/lib/auth";
import { NTU_CAMPUS } from "@/lib/constants";

/**
 * Backs the Restaurants and Transit layers on the browse map.
 *
 * Signed-in only, the same rule as the other two Places proxies: every call
 * costs money. The map's Neighbourhoods layer is local data, so that one keeps
 * working when signed out.
 */

/** Only these layers exist. The client cannot name arbitrary Places types. */
const LAYER_TYPES: Record<string, string[]> = {
  restaurants: ["restaurant"],
  transit: [
    "subway_station",
    "light_rail_station",
    "train_station",
    "bus_station",
  ],
};

/** Nothing in this app is more than a few km from campus. */
const MAX_DISTANCE_FROM_CAMPUS_M = 30_000;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ places: [] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const types = LAYER_TYPES[searchParams.get("layer") ?? ""];
  if (!types) {
    return NextResponse.json({ error: "Unknown layer" }, { status: 400 });
  }

  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Bad centre" }, { status: 400 });
  }

  // A paid endpoint should not be a general-purpose Singapore-wide search just
  // because someone can edit a query string.
  if (haversineMeters(NTU_CAMPUS, { lat, lng }) > MAX_DISTANCE_FROM_CAMPUS_M) {
    return NextResponse.json({ places: [] });
  }

  const requested = Number(searchParams.get("radius"));
  const radius = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 400), MAX_NEARBY_RADIUS_M)
    : 1500;

  const places = await searchNearbyPlaces({ lat, lng }, radius, types);
  return NextResponse.json({ places });
}
