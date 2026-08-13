import type {
  ListingCategory,
  ListingTag,
  Role,
  RoomType,
} from "@/generated/prisma/enums";

/** NTU main campus (Nanyang Ave). All commute times are measured to here. */
export const NTU_CAMPUS = { lat: 1.3483, lng: 103.6831 } as const;

/** Bias Places Autocomplete toward NTU / west Singapore. */
export const SEARCH_BIAS_RADIUS_M = 8000;

/**
 * The residential areas a seeker actually names when they talk about where to
 * live near NTU, for the browse map's Neighbourhoods layer.
 *
 * A fixed list rather than an API call. Places nearby search has no
 * "neighbourhood" type to ask for, this app only ever covers west Singapore,
 * and estate centroids do not move - so a lookup would cost money to return
 * something less accurate. Add to it by hand when the coverage area grows.
 */
export const WEST_SG_NEIGHBOURHOODS: {
  name: string;
  lat: number;
  lng: number;
}[] = [
  { name: "NTU campus", lat: 1.3483, lng: 103.6831 },
  { name: "Pioneer", lat: 1.3376, lng: 103.6974 },
  { name: "Boon Lay", lat: 1.3462, lng: 103.7118 },
  { name: "Jurong West", lat: 1.3496, lng: 103.7075 },
  { name: "Lakeside", lat: 1.3444, lng: 103.7212 },
  { name: "Chinese Garden", lat: 1.3423, lng: 103.7325 },
  { name: "Jurong East", lat: 1.3331, lng: 103.7422 },
  { name: "Clementi", lat: 1.3151, lng: 103.7650 },
  { name: "Bukit Batok", lat: 1.3490, lng: 103.7495 },
  { name: "Choa Chu Kang", lat: 1.3854, lng: 103.7443 },
  { name: "Tengah", lat: 1.3660, lng: 103.7160 },
  { name: "Joo Koon", lat: 1.3277, lng: 103.6784 },
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
 * On-campus listings are informal, student-to-student arrangements. NTU does
 * not sanction them and this app is not connected to hall balloting.
 */
export const ON_CAMPUS_DISCLAIMER =
  "Informal student sublet. Not affiliated with or sanctioned by NTU, and separate from official hall allocation.";

export const PRICE_MIN = 0;
export const PRICE_MAX = 3000;
