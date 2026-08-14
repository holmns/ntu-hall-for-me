import type {
  ListingCategory,
  ListingTag,
  Role,
  RoomType,
} from "@/generated/prisma/enums";

/** NTU main campus (Nanyang Ave). All commute times are measured to here. */
export const NTU_CAMPUS = { lat: 1.3483, lng: 103.6831 } as const;

/**
 * The furthest a browse map is allowed to pan or zoom out to - all of
 * Singapore plus a sliver of Johor Bahru across the causeway, so the map
 * never drifts into open ocean or another country. Read off a live map
 * rather than an official survey boundary, which is fine here: this only
 * caps the camera, it plays no part in categorising or filtering a listing.
 */
export const SINGAPORE_MAP_BOUNDS = {
  north: 1.5313471083437145,
  east: 104.08815781486294,
  south: 1.1714167113557785,
  west: 103.50244919669888,
} as const;

/** Bias Places Autocomplete toward NTU / west Singapore. */
export const SEARCH_BIAS_RADIUS_M = 8000;

/**
 * Outline of the NTU Yunnan Garden campus, drawn on every map so "on campus"
 * is something you can see rather than a label you have to trust.
 *
 * Traced by hand off satellite imagery, so it follows the real perimeter -
 * Nanyang Ave round the halls, the academic spine, NIE - rather than boxing
 * the campus in. It is still orientation only: it is **not** used to decide
 * whether a listing is on campus, that is the provider's `category` choice,
 * and moving these numbers must never start changing search results.
 */
export const NTU_CAMPUS_OUTLINE: { lat: number; lng: number }[] = [
  { lat: 1.35488, lng: 103.68343 },
  { lat: 1.35417, lng: 103.68246 },
  { lat: 1.35293, lng: 103.68098 },
  { lat: 1.35229, lng: 103.68033 },
  { lat: 1.35160, lng: 103.67968 },
  { lat: 1.35179, lng: 103.67952 },
  { lat: 1.35213, lng: 103.67893 },
  { lat: 1.35172, lng: 103.67857 },
  { lat: 1.35127, lng: 103.67852 },
  { lat: 1.35125, lng: 103.67782 },
  { lat: 1.35090, lng: 103.67694 },
  { lat: 1.35007, lng: 103.67618 },
  { lat: 1.34884, lng: 103.67596 },
  { lat: 1.34749, lng: 103.67643 },
  { lat: 1.34691, lng: 103.67730 },
  { lat: 1.34650, lng: 103.67766 },
  { lat: 1.34632, lng: 103.67826 },
  { lat: 1.34590, lng: 103.67824 },
  { lat: 1.34545, lng: 103.67798 },
  { lat: 1.34399, lng: 103.67839 },
  { lat: 1.34310, lng: 103.67889 },
  { lat: 1.34270, lng: 103.67905 },
  { lat: 1.34241, lng: 103.67901 },
  { lat: 1.34171, lng: 103.67879 },
  { lat: 1.34019, lng: 103.67868 },
  { lat: 1.33957, lng: 103.67897 },
  { lat: 1.33956, lng: 103.68037 },
  { lat: 1.33966, lng: 103.68151 },
  { lat: 1.34001, lng: 103.68242 },
  { lat: 1.34474, lng: 103.68855 },
  { lat: 1.34617, lng: 103.69031 },
  { lat: 1.34670, lng: 103.69077 },
  { lat: 1.34720, lng: 103.69040 },
  { lat: 1.34742, lng: 103.68980 },
  { lat: 1.34960, lng: 103.68981 },
  { lat: 1.35571, lng: 103.69021 },
  { lat: 1.35661, lng: 103.69005 },
  { lat: 1.35650, lng: 103.68967 },
  { lat: 1.35625, lng: 103.68926 },
  { lat: 1.35577, lng: 103.68848 },
  { lat: 1.35693, lng: 103.68805 },
  { lat: 1.35686, lng: 103.68722 },
  { lat: 1.35652, lng: 103.68624 },
  { lat: 1.35583, lng: 103.68485 },
];

export const TAG_LABELS: Record<ListingTag, string> = {
  AIRCON: "Aircon",
  ENSUITE: "Ensuite bathroom",
  FURNISHED: "Furnished",
  WIFI_INCLUDED: "Wifi included",
  UTILITIES_INCLUDED: "Utilities included",
  PET_FRIENDLY: "Pet friendly",
  COOKING_ALLOWED: "Cooking allowed",
  WASHING_MACHINE: "Washing machine",
  STUDY_DESK: "Study desk",
  NEAR_MRT: "Near MRT",
  QUIET: "Quiet",
  NO_AGENT_FEE: "No agent fee",
  SHORT_LEASE: "Short lease ok",
  LONG_LEASE: "Long lease",
  FEMALE_ONLY: "Female only",
  MALE_ONLY: "Male only",
  ANY_GENDER: "Any gender",
};

/** Grouped for the provider form so 17 checkboxes do not read as a wall. */
export const TAG_GROUPS: { label: string; tags: ListingTag[] }[] = [
  {
    label: "Room",
    tags: ["AIRCON", "ENSUITE", "FURNISHED", "STUDY_DESK", "WASHING_MACHINE"],
  },
  {
    label: "Included",
    tags: ["WIFI_INCLUDED", "UTILITIES_INCLUDED", "COOKING_ALLOWED", "NO_AGENT_FEE"],
  },
  { label: "Vibe & location", tags: ["QUIET", "NEAR_MRT", "PET_FRIENDLY"] },
  { label: "Lease", tags: ["SHORT_LEASE", "LONG_LEASE"] },
  { label: "Gender preference", tags: ["FEMALE_ONLY", "MALE_ONLY", "ANY_GENDER"] },
];

export const ALL_TAGS = Object.keys(TAG_LABELS) as ListingTag[];

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  SINGLE: "Single room",
  SHARED: "Shared room",
  WHOLE_UNIT: "Whole unit",
};

export const CATEGORY_LABELS: Record<ListingCategory, string> = {
  ON_CAMPUS: "On-campus sublet",
  OFF_CAMPUS: "Off-campus",
};

export const ROLE_LABELS: Record<Role, string> = {
  SEEKER: "Looking for a room",
  PROVIDER: "Offering a room",
  BOTH: "Looking and offering",
};

/** The one-line explanation under each role on the settings page. */
export const ROLE_HINTS: Record<Role, string> = {
  SEEKER: "You are searching for somewhere to live near NTU.",
  PROVIDER: "You have a room to sublet or rent out.",
  BOTH: "You are doing both - subletting your room and looking for another.",
};

/** How a travel mode reads in a commute sentence ("17 min by bus/MRT"). */
export const TRAVEL_MODE_LABELS = {
  walking: "walk",
  transit: "by bus/MRT",
  driving: "drive",
} as const;

/**
 * The commute ceilings the filter panel offers, in minutes.
 *
 * A fixed set rather than free entry, and the search page validates against
 * this list: a URL carrying ?commute=7 would narrow the results in a way the
 * panel could neither display nor clear.
 */
export const COMMUTE_BANDS = [15, 30, 45] as const;

/**
 * On-campus listings are informal, student-to-student arrangements. NTU does
 * not sanction them and this app is not connected to hall balloting.
 */
export const ON_CAMPUS_DISCLAIMER =
  "Informal student sublet. Not affiliated with or sanctioned by NTU, and separate from official hall allocation.";

export const PRICE_MIN = 0;
export const PRICE_MAX = 3000;
