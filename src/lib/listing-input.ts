import { z } from "zod";

import { ALL_TAGS, PRICE_MAX, PRICE_MIN } from "./constants";

/**
 * An untouched optional field posts as "", which every coercion below would
 * otherwise turn into 0 or an Invalid Date. Absent has to stay absent: the
 * listing page distinguishes "no deposit" from "the provider did not say".
 */
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/** Whole months, and no lease this app should be brokering runs past three years. */
const optionalMonths = (label: string) =>
  z.preprocess(
    blankToUndefined,
    z.coerce
      .number()
      .int()
      .min(1, `${label} must be at least a month`)
      .max(36, `${label} looks too long (max 36 months)`)
      .optional(),
  );

/**
 * The listing fields the provider form submits, shared by create and edit.
 *
 * No `category`: on- or off-campus is derived from the resolved point by
 * `campusCategory`, so there is nothing for the form to say about it.
 */
export const listingSchema = z.object({
  title: z.string().trim().min(6, "Give the listing a clearer title").max(120),
  description: z
    .string()
    .trim()
    .min(30, "Write at least a couple of sentences so matching has something to work with")
    .max(4000),
  // The currency formatting is stripped rather than rejected: "$1,200" is a
  // perfectly clear rent, and the form strips it on paste too - this is what
  // covers autofill and anything posted directly.
  price: z.preprocess(
    (value) =>
      typeof value === "string" ? value.replace(/[$,\s]/g, "") : value,
    z.coerce
      .number()
      .int()
      .min(PRICE_MIN, "Price cannot be negative")
      .max(PRICE_MAX, `Price looks too high (max $${PRICE_MAX})`),
  ),
  roomType: z.enum(["SINGLE", "SHARED", "WHOLE_UNIT"]),

  // All optional. A provider who has not agreed a date with their landlord yet
  // must still be able to publish; the listing page says so rather than
  // printing a number nobody committed to.
  availableFrom: z.preprocess(blankToUndefined, z.coerce.date().optional()),
  minTermMonths: optionalMonths("Minimum stay"),
  maxTermMonths: optionalMonths("Maximum stay"),
  deposit: z.preprocess(
    blankToUndefined,
    z.coerce
      .number()
      .int()
      .min(0, "Deposit cannot be negative")
      // Three months' rent at the app's ceiling. Anything past that is a typo
      // or something this app should not be helping arrange.
      .max(PRICE_MAX * 3, "That deposit looks too high")
      .optional(),
  ),
  housemates: z.preprocess(
    blankToUndefined,
    z.coerce
      .number()
      .int()
      .min(0, "Housemates cannot be negative")
      .max(20, "That is more housemates than this form can believe")
      .optional(),
  ),

  tags: z.array(z.enum(ALL_TAGS as [string, ...string[]])).default([]),
  placeId: z.string().trim().optional(),
  address: z.string().trim().min(5, "Pick an address from the suggestions"),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  pinAdjusted: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
})
  // Checked here rather than in the action, so both create and edit get it and
  // the message lands on the field the provider has to change.
  .refine(
    (v) =>
      v.minTermMonths == null ||
      v.maxTermMonths == null ||
      v.maxTermMonths >= v.minTermMonths,
    {
      message: "Maximum stay cannot be shorter than the minimum",
      path: ["maxTermMonths"],
    },
  );

export type ListingInput = z.output<typeof listingSchema>;

/**
 * How far the provider may drag the pin from its anchor. Wide enough to move
 * across an HDB estate to the right block, tight enough that a hand-edited
 * hidden field cannot relocate the listing.
 *
 * On create the anchor is the geocoded address. On edit, when no new address
 * was picked, it is the listing's stored point - otherwise an edit would be a
 * way around the check.
 */
export const MAX_ADJUST_M = 2000;

export type ListingFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/** Turns a zod failure into the per-field messages the form renders. */
export function fieldErrorsFrom(error: z.ZodError): ListingFormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return { error: "Please fix the highlighted fields.", fieldErrors };
}

/** Reads the listing fields out of a submitted form. */
export function parseListingForm(formData: FormData) {
  return listingSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    price: formData.get("price"),
    roomType: formData.get("roomType"),
    availableFrom: formData.get("availableFrom"),
    minTermMonths: formData.get("minTermMonths"),
    maxTermMonths: formData.get("maxTermMonths"),
    deposit: formData.get("deposit"),
    housemates: formData.get("housemates"),
    tags: formData.getAll("tags"),
    placeId: formData.get("placeId") ?? undefined,
    address: formData.get("address"),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
    pinAdjusted: formData.get("pinAdjusted") ?? undefined,
  });
}
