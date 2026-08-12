/**
 * Photos for the seeded demo listings.
 *
 * Real room photography from Unsplash, whose licence allows free commercial
 * use without attribution. The ids were picked by hand so every one is a
 * usable interior shot rather than a close-up of a duvet.
 *
 * The seed downloads these once and uploads them into the same
 * `listing-images` bucket a provider's own uploads go to, so a seeded listing
 * and a posted one are indistinguishable and nothing renders from a
 * third-party host at page load.
 */

import type { ListingCategory, ListingTag, RoomType } from "../src/generated/prisma/enums";

export type MockPhoto = { id: string; alt: string };

/** Landscape crop at the longest edge the uploader would have produced. */
export function photoUrl(photo: MockPhoto): string {
  return `https://images.unsplash.com/photo-${photo.id}?w=1600&h=1067&fit=crop&crop=entropy&q=75&fm=jpg`;
}

export const PHOTO_WIDTH = 1600;
export const PHOTO_HEIGHT = 1067;

const BEDROOM: MockPhoto[] = [
  { id: "1522771739844-6a9f6d5f14af", alt: "Bedroom with a double bed and a bedside lamp" },
  { id: "1560185893-a55cbc8c57e8", alt: "Spacious bedroom with a large window" },
  { id: "1615874959474-d609969a20ed", alt: "Bedroom with a gallery wall and hanging plants" },
  { id: "1616594039964-ae9021a400a0", alt: "Grey bedroom with a double bed and side tables" },
  { id: "1505693416388-ac5ce068fe85", alt: "Bedroom with a padded headboard and two windows" },
  { id: "1595526114035-0d45ed16cfbf", alt: "Bright white bedroom with a window" },
  { id: "1540518614846-7eded433c457", alt: "Bedroom with a blue rug and orange cushions" },
  { id: "1566665797739-1674de7a421a", alt: "Bedroom with dark wood panelling" },
  { id: "1531835551805-16d864c8d311", alt: "White bedroom with framed prints above the bed" },
  { id: "1616486029423-aaa4789e8c9a", alt: "Bedroom with a wooden bench at the foot of the bed" },
  { id: "1618221118493-9cfa1a1c00da", alt: "Bedroom with a blue feature wall" },
];

const DORM: MockPhoto[] = [
  { id: "1486304873000-235643847519", alt: "Student room with a desk against an orange wall" },
  { id: "1555930112-0159bcdc3fe5", alt: "Hall room desk with a laptop by the window" },
  { id: "1632119289059-793dd347950f", alt: "Student room with a single bed and study desk" },
  { id: "1616486232086-81d47190669a", alt: "Student room with a gallery wall above the bed" },
  { id: "1628746234641-28eb583a51b4", alt: "Plain single room with a bed and a desk lamp" },
  { id: "1463620910506-d0458143143e", alt: "Student room with a desk, chair and single bed" },
  { id: "1564273795917-fe399b763988", alt: "Student room with a mirror above the bed" },
  { id: "1622429420441-60dd67f737a6", alt: "Student room lit with fairy lights" },
  { id: "1568495248636-6432b97bd949", alt: "Single bed beside a bright window" },
];

const BUNK: MockPhoto[] = [
  { id: "1555854877-bab0e564b8d5", alt: "Bunk beds in a shared room by a window" },
  { id: "1709805619372-40de3f158e83", alt: "Shared room with wooden bunk beds" },
  { id: "1571474039046-42bc4e7f4b98", alt: "Loft bed with a study desk underneath" },
];

const STUDY: MockPhoto[] = [
  { id: "1580152213601-87df3d2c56e6", alt: "Study desk with a chair and a wall clock" },
  { id: "1655276588918-fe4730b4227c", alt: "White study desk with drawers by a sunny window" },
  { id: "1643942556894-57626c4a9cd5", alt: "Study desk with a pegboard against a blue wall" },
  { id: "1769311484091-3f3dffeff5be", alt: "Study area with desks and chairs" },
];

const KITCHEN: MockPhoto[] = [
  { id: "1600489000022-c2086d79f9d4", alt: "Kitchen with green cabinets and a window over the sink" },
  { id: "1556911220-bff31c812dba", alt: "Kitchen counter with a gas hob" },
  { id: "1484154218962-a197022b5858", alt: "Kitchen with a stainless steel fridge" },
  { id: "1617228069096-4638a7ffc906", alt: "Kitchen with an island and bar stools" },
  { id: "1622372738946-62e02505feb3", alt: "Kitchen with dark cabinets and a breakfast bar" },
  { id: "1507089947368-19c1da9775ae", alt: "White kitchen with an island" },
  { id: "1628797285815-453c1d0d21e3", alt: "Kitchen with open shelving and a wooden table" },
  { id: "1588854337221-4cf9fa96059c", alt: "White kitchen with pendant lights" },
  { id: "1588854337236-6889d631faa8", alt: "Kitchen with blue cabinets" },
  { id: "1632583824020-937ae9564495", alt: "Kitchen with a bar and stools" },
  { id: "1600684388091-627109f3cd60", alt: "Compact kitchen with a black extractor hood" },
  { id: "1556910096-6f5e72db6803", alt: "Kitchen with subway tiles and open shelves" },
];

const LIVING: MockPhoto[] = [
  { id: "1583847268964-b28dc8f51f92", alt: "Living room with a sofa and a large window" },
  { id: "1631679706909-1844bbd07221", alt: "Living room with round mirrors above the sofa" },
  { id: "1618220179428-22790b461013", alt: "Living area with plants and an armchair" },
  { id: "1616047006789-b7af5afb8c20", alt: "Living room with an orange sofa and shelving" },
  { id: "1564078516393-cf04bd966897", alt: "Living room with a corner sofa and a city view" },
  { id: "1586023492125-27b2c045efd7", alt: "Living room with a yellow armchair and TV unit" },
  { id: "1605774337664-7a846e9cdf17", alt: "Living room with a green sofa and coffee table" },
  { id: "1632829882891-5047ccc421bc", alt: "Living room with a white sofa and framed prints" },
  { id: "1618221195710-dd6b41faaea6", alt: "Living room with a wide window and a floor lamp" },
  { id: "1560448204-e02f11c3d0e2", alt: "Open plan living and dining area" },
  { id: "1554995207-c18c203602cb", alt: "Living room with a teal feature wall" },
  { id: "1600121848594-d8644e57abab", alt: "Living room with a grey sofa and a TV" },
  { id: "1560185007-cde436f6a4d0", alt: "Dining and living area with wooden floors" },
];

const BATHROOM: MockPhoto[] = [
  { id: "1584622650111-993a426fbf0a", alt: "Bathroom with a walk-in shower and vanity" },
  { id: "1631889993959-41b4e9c6e3c5", alt: "Bathroom with a bathtub and wood panelling" },
  { id: "1695002817411-203c7f19dfa3", alt: "Bathroom with twin basins and a large mirror" },
  { id: "1620626011761-996317b8d101", alt: "Bathroom with a freestanding bath by the window" },
  { id: "1661107259637-4e1c55462428", alt: "Bathroom with a round mirror and dark fittings" },
  { id: "1629079447777-1e605162dc8d", alt: "Bathroom with twin basins and a shower" },
  { id: "1552321554-5fefe8c9ef14", alt: "Small bathroom with a window and plants" },
  { id: "1587527901949-ab0341697c1e", alt: "Bathroom with a glass shower screen" },
  { id: "1643949719317-4342d8d4031e", alt: "Bathroom with a bath under a window" },
  { id: "1521783593447-5702b9bfd267", alt: "Bathroom with a bath and tiled walls" },
];

type PhotoSubject = {
  category: ListingCategory;
  roomType: RoomType;
  tags: ListingTag[];
};

/**
 * Deterministic allocator that walks each pool in order, so 20 listings get
 * 20 different cover photos instead of the same three on repeat.
 */
export function createPhotoPicker(): (listing: PhotoSubject) => MockPhoto[] {
  const cursors = new Map<MockPhoto[], number>();
  const take = (pool: MockPhoto[]): MockPhoto => {
    const at = cursors.get(pool) ?? 0;
    cursors.set(pool, at + 1);
    return pool[at % pool.length];
  };

  return ({ category, roomType, tags }) => {
    const photos: MockPhoto[] = [];

    // Cover: what the room itself actually is.
    if (roomType === "SHARED") photos.push(take(BUNK));
    else if (roomType === "WHOLE_UNIT") photos.push(take(LIVING));
    else photos.push(take(category === "ON_CAMPUS" ? DORM : BEDROOM));

    // Then whatever the listing claims to offer.
    if (tags.includes("STUDY_DESK")) photos.push(take(STUDY));
    if (roomType === "WHOLE_UNIT" || tags.includes("COOKING_ALLOWED")) {
      photos.push(take(KITCHEN));
    }
    if (tags.includes("ENSUITE")) photos.push(take(BATHROOM));

    // Everything deserves at least a second angle.
    if (photos.length < 2) {
      photos.push(take(category === "ON_CAMPUS" ? DORM : LIVING));
    }

    return photos.slice(0, 4);
  };
}
