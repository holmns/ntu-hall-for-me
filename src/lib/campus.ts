import { isInsideArea } from "./area-filter";
import { NTU_CAMPUS_OUTLINE } from "./constants";
import type { ListingCategory } from "@/generated/prisma/enums";

/**
 * The one place the campus outline is more than decoration.
 *
 * Everywhere else the shape is drawn for orientation and nothing reads it. On
 * the listing write path it decides the category, which is not a preference:
 * a room either stands on campus or it does not, and the address already says
 * which. So the provider form has no category field at all - it shows what the
 * address implies, and this is what makes that true rather than merely
 * displayed.
 *
 * Two consequences to keep in mind:
 *
 * - Moving the coordinates in `NTU_CAMPUS_OUTLINE` now changes how listings
 *   are categorised on their next save. It still cannot touch a row nobody
 *   edits, and search is unaffected either way - that reads the stored
 *   `category` column, never this.
 * - A hall the trace clips off would post as off-campus with a real commute
 *   attached, which is wrong and invisible. The outline is the fix; there is
 *   no override.
 *
 * This module imports nothing but data, so the post form can show the same
 * answer the server action is about to reach.
 */
export function isInsideCampus(point: { lat: number; lng: number }): boolean {
  return isInsideArea(point, NTU_CAMPUS_OUTLINE);
}

/** The category to store for a room at `point`. */
export function campusCategory(point: {
  lat: number;
  lng: number;
}): ListingCategory {
  return isInsideCampus(point) ? "ON_CAMPUS" : "OFF_CAMPUS";
}
