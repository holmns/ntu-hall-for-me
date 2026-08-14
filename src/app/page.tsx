import Link from "next/link";

import { SearchBar } from "@/components/search-bar";
import { ListingCard } from "@/components/listing-card";
import { prisma } from "@/lib/prisma";
import { LISTING_IMAGE_SELECT } from "@/lib/images";

/**
 * Pre-built searches for the band under the hero.
 *
 * Every one is a URL the results page already understands, so this is
 * navigation rather than a feature: the point is that a seeker who does not
 * know what to type still has somewhere to press.
 */
const STARTING_POINTS = [
  { label: "On-campus halls", href: "/search?category=ON_CAMPUS" },
  { label: "Off-campus rooms", href: "/search?category=OFF_CAMPUS" },
  { label: "Under $600", href: "/search?max=600" },
  { label: "$600 to $900", href: "/search?min=600&max=900" },
  { label: "Single rooms", href: "/search?roomType=SINGLE" },
  { label: "Shared rooms", href: "/search?roomType=SHARED" },
  { label: "Whole units", href: "/search?roomType=WHOLE_UNIT" },
];

export default async function HomePage() {
  const [total, recent] = await Promise.all([
    prisma.listing.count({ where: { status: "ACTIVE" } }),
    prisma.listing.findMany({
      where: { status: "ACTIVE" },
      include: {
        provider: { select: { id: true, name: true, image: true } },
        images: LISTING_IMAGE_SELECT,
      },
      orderBy: { createdAt: "desc" },
      // Six fills the grid evenly at one, two and three columns.
      take: 6,
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            {total} rooms near NTU
          </span>
          <h1 className="mt-5 text-balance text-3xl font-semibold leading-[1.15] tracking-tight text-ink sm:text-[44px]">
            Find a room near NTU by just
            <span className="text-brand"> describing it</span>
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-balance text-[15px] leading-relaxed text-ink-soft">
            Skip the filter checkboxes. Say what you actually want and we rank
            every listing for you, with a plain-English reason for each match.
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-3xl">
          <SearchBar showExamples />
        </div>
      </section>

      {/* This band used to hold three counters - rooms listed, on-campus
          sublets, cheapest room. They described the inventory rather than
          offering anything to do with it, and the headline number gets less
          persuasive the longer a seeker looks at it. The count that is worth
          stating is already in the hero pill; the band itself is better spent
          on somewhere to go. */}
      <section aria-labelledby="starting-points">
        <h2
          id="starting-points"
          className="text-sm font-medium text-ink-soft"
        >
          Common starting points
        </h2>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {STARTING_POINTS.map((point) => (
            <Link
              key={point.href}
              href={point.href}
              className="rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] text-ink-soft transition-colors hover:border-brand-line hover:bg-brand-soft hover:text-brand"
            >
              {point.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink">
              Recently posted
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-soft">
              The newest rooms, before any ranking is applied.
            </p>
          </div>
          <Link
            href="/search"
            className="shrink-0 text-[13px] font-medium text-brand hover:underline"
          >
            Browse all
          </Link>
        </div>
        {/* Stacked, unlike the browse list. This grid has a full 1152px to
            spend on six rooms, and a row card there is a 200px photo beside a
            very short line of text and a lot of nothing. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recent.map((listing) => (
            <ListingCard key={listing.id} listing={listing} layout="stacked" />
          ))}
        </div>
      </section>

      <section className="card mt-14 flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink">
            Have a room to offer?
          </h2>
          <p className="mt-1 text-[14px] text-ink-soft">
            Post it once. Seekers find it through natural-language search.
          </p>
        </div>
        <Link href="/post" className="btn-primary shrink-0">
          Post a room
        </Link>
      </section>
    </div>
  );
}
