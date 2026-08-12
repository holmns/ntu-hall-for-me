import { redirect } from "next/navigation";

import { PostListingForm } from "@/components/post-listing-form";
import { getCurrentUser } from "@/lib/auth";
import { hasMapsKey } from "@/lib/maps";

export const dynamic = "force-dynamic";

export default async function PostPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?callbackUrl=/post");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Post a room
      </h1>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
        One form. Seekers find it by describing what they want in plain English,
        so the description matters more than the checkboxes.
      </p>

      {!hasMapsKey() && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
          <span className="font-medium">No Maps API key configured.</span>{" "}
          Address suggestions come from a small built-in list of NTU-area
          addresses, and the commute to campus is estimated from straight-line
          distance. Set GOOGLE_MAPS_API_KEY for real Places and Distance Matrix
          results.
        </div>
      )}

      <PostListingForm />
    </div>
  );
}
