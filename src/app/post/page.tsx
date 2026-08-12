import { redirect } from "next/navigation";

import { PostListingForm } from "@/components/post-listing-form";
import { getCurrentUser } from "@/lib/auth";
import { hasImageStorage } from "@/lib/storage";

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

      <PostListingForm imagesEnabled={hasImageStorage()} />
    </div>
  );
}
