import { z } from "zod";

import { ALL_TAGS, PRICE_MAX, PRICE_MIN } from "./constants";

/** The listing fields the provider form submits, shared by create and edit. */
export const listingSchema = z.object({
  title: z.string().trim().min(6, "Give the listing a clearer title").max(120),
  description: z
    .string()
    .trim()
    .min(30, "Write at least a couple of sentences so matching has something to work with")
    .max(4000),
  category: z.enum(["ON_CAMPUS", "OFF_CAMPUS"]),
  price: z.coerce
    .number()
    .int()
    .min(PRICE_MIN, "Price cannot be negative")
    .max(PRICE_MAX, `Price looks too high (max $${PRICE_MAX})`),
  roomType: z.enum(["SINGLE", "SHARED", "WHOLE_UNIT"]),
  tags: z.array(z.enum(ALL_TAGS as [string, ...string[]])).default([]),
  placeId: z.string().trim().optional(),
  address: z.string().trim().min(5, "Pick an address from the suggestions"),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  pinAdjusted: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
});

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
    category: formData.get("category"),
    price: formData.get("price"),
    roomType: formData.get("roomType"),
    tags: formData.getAll("tags"),
    placeId: formData.get("placeId") ?? undefined,
    address: formData.get("address"),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
    pinAdjusted: formData.get("pinAdjusted") ?? undefined,
  });
}
