"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { approximateLocation, computeCommute, getPlaceDetail } from "@/lib/maps";
import { ALL_TAGS, PRICE_MAX, PRICE_MIN } from "@/lib/constants";

const schema = z.object({
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
});

export type PostListingState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function createListing(
  _prev: PostListingState,
  formData: FormData,
): Promise<PostListingState> {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/signin?callbackUrl=/post");
  }

  const parsed = schema.safeParse({
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
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const data = parsed.data;

  // Re-resolve the place server-side when we have a placeId, so the stored
  // coordinates cannot be spoofed by editing the hidden form fields.
  let point = { lat: data.lat, lng: data.lng };
  let address = data.address;
  if (data.placeId) {
    const detail = await getPlaceDetail(data.placeId);
    if (detail) {
      point = { lat: detail.lat, lng: detail.lng };
      address = detail.address || address;
    }
  }

  // The single Maps write-path call. Results are cached on the row and search
  // never recomputes them.
  const commute = await computeCommute(point, data.category);
  const approx = approximateLocation(point, `${user.id}:${address}`);

  const listing = await prisma.listing.create({
    data: {
      providerId: user.id,
      title: data.title,
      description: data.description,
      category: data.category,
      price: data.price,
      roomType: data.roomType,
      tags: data.tags as never,
      address,
      lat: point.lat,
      lng: point.lng,
      approxLat: approx.lat,
      approxLng: approx.lng,
      distanceMeters: commute.distanceMeters,
      distanceWalkingMin: commute.walkingMin,
      distanceTransitMin: commute.transitMin,
      distanceDrivingMin: commute.drivingMin,
    },
    select: { id: true },
  });

  // Providers who only ever sought before are now both.
  await prisma.user.update({
    where: { id: user.id },
    data: { role: user.role === "SEEKER" ? "BOTH" : user.role },
  });

  revalidatePath("/");
  revalidatePath("/search");
  redirect(`/listings/${listing.id}`);
}
