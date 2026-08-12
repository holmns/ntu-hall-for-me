import type {
  ListingCategory,
  ListingTag,
  RoomType,
} from "@/generated/prisma/enums";

/** NTU main campus (Nanyang Ave). All commute times are measured to here. */
export const NTU_CAMPUS = { lat: 1.3483, lng: 103.6831 } as const;

/** Bias Places Autocomplete toward NTU / west Singapore. */
export const SEARCH_BIAS_RADIUS_M = 8000;

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

/**
 * On-campus listings are informal, student-to-student arrangements. NTU does
 * not sanction them and this app is not connected to hall balloting.
 */
export const ON_CAMPUS_DISCLAIMER =
  "Informal student sublet. Not affiliated with or sanctioned by NTU, and separate from official hall allocation.";

export const PRICE_MIN = 0;
export const PRICE_MAX = 3000;
