/**
 * The four figures in the landing page's snapshot band.
 *
 * Every one is read off the listings that are actually live, because a number
 * on a landing page is a claim: "$425 median on campus" is checkable in two
 * clicks from the same page, and a hard-coded one goes wrong the first time
 * anybody posts a room.
 *
 * Each stat drops itself when there is nothing to compute it from - an empty
 * database renders no band rather than a row of dashes - so callers must not
 * assume four of them.
 */

import type { ListingCategory, RoomType } from "@/generated/prisma/enums";
import { NTU_AREA_PLACES } from "./ntu-area-places";

export type LandingStat = {
  /** The figure itself, already formatted. */
  value: string;
  label: string;
  /** One line of context under the label. */
  note: string;
};

/** Exactly what the band needs, so the page can select this and nothing else. */
export type LandingStatInput = {
  price: number;
  category: ListingCategory;
  roomType: RoomType;
  lat: number;
  lng: number;
  distanceTransitMin: number | null;
};

/** The band's own line: the cheap end is what a student scans for first. */
const BUDGET = 600;

/**
 * How far a listing can be from a known neighbourhood before it stops counting
 * as being in it. The address book is west-Singapore only, so without a cap the
 * nearest entry to a room in Tampines is still Clementi.
 */
const AREA_RADIUS_M = 2_500;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2
    ? sorted[Math.floor(mid)]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function money(amount: number): string {
  return `$${Math.round(amount).toLocaleString()}`;
}

/**
 * Metres between two points. A local copy of the one in maps.ts on purpose:
 * that module reaches for the Maps key at call time and this is a landing page
 * doing arithmetic on rows it already has.
 */
function metresBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * The neighbourhoods the off-campus rooms are actually in, commonest first.
 *
 * Listings store an address string and a point, not an area, and the string is
 * whatever Places returned - "Blk 644 Jurong West St 61" is in Pioneer and says
 * nothing about it. The point is the reliable part, so this reads the area off
 * the nearest entry in the seed address book instead of parsing prose.
 */
function areaNames(rows: LandingStatInput[], limit: number): string[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    let best: { area: string; metres: number } | null = null;
    for (const place of NTU_AREA_PLACES) {
      const metres = metresBetween(row, place);
      if (!best || metres < best.metres) best = { area: place.area, metres };
    }
    if (!best || best.metres > AREA_RADIUS_M) continue;
    counts.set(best.area, (counts.get(best.area) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([area]) => area);
}

export function landingStats(rows: LandingStatInput[]): LandingStat[] {
  const stats: LandingStat[] = [];

  const cheap = rows.filter((row) => row.price < BUDGET);
  if (cheap.length > 0) {
    // The two things that make a room cheap here, counted together rather than
    // separately: a hall room and a shared room are the same answer to "why is
    // this $400", and the reader is being told what the cheap end looks like.
    const spartan = cheap.filter(
      (row) => row.category === "ON_CAMPUS" || row.roomType === "SHARED",
    ).length;
    stats.push({
      value: String(cheap.length),
      label: `rooms under $${BUDGET}`,
      note:
        spartan > 0
          ? `${spartan} of them halls or shared rooms`
          : "all of them off-campus singles",
    });
  }

  const onCampus = rows.filter((row) => row.category === "ON_CAMPUS");
  if (onCampus.length > 0) {
    stats.push({
      value: money(median(onCampus.map((row) => row.price))),
      label: "median on campus",
      note: `${onCampus.length} informal hall sublet${onCampus.length === 1 ? "" : "s"}`,
    });
  }

  const offCampus = rows.filter((row) => row.category === "OFF_CAMPUS");
  if (offCampus.length > 0) {
    const areas = areaNames(offCampus, 3);
    stats.push({
      value: money(median(offCampus.map((row) => row.price))),
      label: "median off campus",
      note:
        areas.length > 0
          ? areas.join(", ")
          : `${offCampus.length} room${offCampus.length === 1 ? "" : "s"} around NTU`,
    });
  }

  // On-campus rooms store a commute of 0 and are excluded from every
  // distance comparison in the app, so they are excluded here too: "0 min" is
  // true and tells a seeker nothing about getting to campus from a room.
  const commutes = offCampus
    .map((row) => row.distanceTransitMin)
    .filter((minutes): minutes is number => minutes != null && minutes > 0);
  if (commutes.length > 0) {
    stats.push({
      value: `${Math.min(...commutes)} min`,
      label: "closest commute",
      note: "by bus/MRT, off-campus room",
    });
  }

  return stats;
}
