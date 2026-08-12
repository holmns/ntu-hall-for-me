import Link from "next/link";

import { SearchBar } from "@/components/search-bar";
import { ListingCard } from "@/components/listing-card";
import { prisma } from "@/lib/prisma";
import { LISTING_IMAGE_SELECT } from "@/lib/images";

export default async function HomePage() {
  const [total, onCampus, cheapest, recent] = await Promise.all([
    prisma.listing.count({ where: { status: "ACTIVE" } }),
    prisma.listing.count({ where: { status: "ACTIVE", category: "ON_CAMPUS" } }),
    prisma.listing.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { price: "asc" },
      select: { price: true },
    }),
    prisma.listing.findMany({
      where: { status: "ACTIVE" },
      include: {
        provider: { select: { id: true, name: true, image: true } },
        images: LISTING_IMAGE_SELECT,
      },
      orderBy: { createdAt: "desc" },
      take: 4,
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

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Rooms listed" value={String(total)} />
        <Stat label="On-campus sublets" value={String(onCampus)} />
        <Stat
          label="Cheapest room"
          value={cheapest ? `$${cheapest.price}` : "-"}
        />
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
        <div className="grid gap-3 sm:grid-cols-2">
          {recent.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-5 py-4">
      <div className="text-2xl font-semibold tabular-nums tracking-tight text-ink">
        {value}
      </div>
      <div className="mt-0.5 text-[13px] text-ink-soft">{label}</div>
    </div>
  );
}
