import Link from "next/link";

import { SearchBar } from "@/components/search-bar";
import { ListingCard } from "@/components/listing-card";
import { prisma } from "@/lib/prisma";
import { LISTING_IMAGE_SELECT } from "@/lib/images";
import { landingStats } from "@/lib/landing-stats";

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

/**
 * The container every band on the page is measured against. Wider than the
 * 1152px the working pages use, because this one is showing three rooms across
 * rather than a list beside a map, and the hero photo behind it runs edge to
 * edge either way.
 */
const CONTAINER = "mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-12";

export default async function HomePage() {
  const [inventory, recent] = await Promise.all([
    // Every live room, but six columns of it. This is the count in the hero
    // pill and the whole snapshot band, which is why there is no separate
    // count() query: at this size the rows are cheaper than a round trip.
    prisma.listing.findMany({
      where: { status: "ACTIVE" },
      select: {
        price: true,
        category: true,
        roomType: true,
        lat: true,
        lng: true,
        distanceTransitMin: true,
      },
    }),
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

  const stats = landingStats(inventory);

  return (
    // `data-landing` is what globals.css hides the site footer on - the root
    // layout renders it without knowing which route is above it, and this page
    // ends on a disclaimer of its own.
    <div data-landing className="min-h-screen">
      {/* The hero is the page's own header bar as well: the site bar is fixed
          over this block rather than laid out above it, so the photo starts at
          the very top of the document. */}
      {/* Not `overflow-hidden`, however much a full-bleed photo looks like it
          wants it: the search box's filter panel is positioned out of the
          bottom of this block, and clipping here cut it off at the hero's edge
          - two rows of a five-row panel, with no scrollbar to say so. The
          photo is `object-cover` inside `inset-0` and never spills anyway. */}
      {/* `isolate` is what keeps the photo's `-z-10` behind the terracotta and
          not behind the page. `z-10` is what lets the filter panel out: the
          isolation makes this a stacking context, so the panel's own z-index
          is spent inside it, and every room card below is `relative` and
          therefore painted after this block. Without a z-index here the panel
          opens *under* the cards.

          20 rather than 10 because a card's photo-count badge is itself z-10
          and later in the document, which put a "2" chip over the open panel.
          Below the header's 30, which has to stay reachable. */}
      {/* `data-hero` is what `HeaderBar` watches to know when to drop its cream
          skin: the bar is transparent for exactly as long as this block is
          behind it, and takes the app's solid bar the moment it is not. */}
      <div data-hero className="relative isolate z-20 bg-brand">
        {/* Decorative, so no alt text: everything the photo says is said again
            in the headline over it. Held at 65% over the terracotta - enough
            for the Hive to be recognisable to anyone who has been there,
            little enough that white type sits on it without a scrim. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-ntu-hive.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-80"
        />

        <div
          className={`${CONTAINER} pb-14 pt-28 text-center sm:pb-20 lg:pt-35`}
        >
          <div className="mx-auto max-w-215">
            {/* `on-photo-text` throughout: see globals.css. Everything painted
                straight onto the photograph carries it, the search box below
                being the one exception - it is an opaque panel and has nothing
                to be lifted off. */}
            <h1 className="on-photo-text mt-5 text-balance font-display text-[38px] font-extrabold leading-[1.02] tracking-[-0.035em] text-cream-bright sm:text-[52px] lg:text-[60px]">
              Find a room near NTU by just describing it
            </h1>

            <p className="on-photo-text mx-auto mt-5 max-w-[580px] text-balance text-[17px] leading-[1.5] text-cream">
              Skip the filter checkboxes. Say what you actually want and we rank
              every listing for you, with a plain-English reason for each match.
            </p>

            <div className="mt-8 text-left sm:mt-[34px]">
              <SearchBar showExamples variant="hero" />
            </div>
          </div>
        </div>
      </div>

      <div className={`${CONTAINER} py-12`}>
        {/* The heading sits in the row rather than over it: seven pills and
            three words fit on one line at this width, and stacking them spends
            a whole band on a label. */}
        <section aria-labelledby="starting-points">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2
              id="starting-points"
              className="mr-3 font-display text-sm font-semibold text-ink-soft"
            >
              Common starting points
            </h2>
            {STARTING_POINTS.map((point) => (
              <Link
                key={point.href}
                href={point.href}
                className="rounded-full border border-line-strong px-4 py-2.5 text-[13px] text-ink-mid transition-colors hover:border-brand hover:bg-cream hover:text-brand-ink"
              >
                {point.label}
              </Link>
            ))}
          </div>
        </section>

        {/* Four figures read off the live listings, not the inventory count
            that used to stand here on its own. A headline total says the site
            is big; these say what a room costs and how far it is, which is the
            question a seeker arrived with. Computed in lib/landing-stats.ts,
            and any of them can be missing. */}
        {stats.length > 0 && (
          <section
            aria-label="What is listed right now"
            className="mt-11 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl bg-sand-deep p-[22px]"
              >
                <div className="font-display text-[34px] font-bold leading-none tracking-[-0.03em] tabular-nums text-ink">
                  {stat.value}
                </div>
                <div className="mt-2 font-display text-[13px] font-semibold">
                  {stat.label}
                </div>
                <div className="mt-0.5 text-xs text-ink-soft">{stat.note}</div>
              </div>
            ))}
          </section>
        )}

        <section className="mt-14">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h2 className="font-display text-[26px] font-bold tracking-[-0.025em]">
                Recently posted
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                The newest rooms, before any ranking is applied.
              </p>
            </div>
            <Link
              href="/search"
              className="shrink-0 font-display text-sm font-semibold text-brand-ink hover:underline"
            >
              Browse all
            </Link>
          </div>

          {/* Stacked, unlike the browse list. This grid has the full container
              to spend on six rooms, and a row card there is a 200px photo
              beside a very short line of text and a lot of nothing. */}
          <div className="mt-5 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((listing) => (
              <ListingCard key={listing.id} listing={listing} layout="stacked" />
            ))}
          </div>
        </section>

        <section className="mt-14 flex flex-col items-start justify-between gap-8 rounded-[28px] bg-bark p-8 sm:p-11 lg:flex-row lg:items-center lg:gap-10">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand-light">
              For providers
            </span>
            <h2 className="mt-2.5 font-display text-[28px] font-bold leading-[1.05] tracking-[-0.03em] text-bone sm:text-[34px]">
              Have a room to offer?
            </h2>
            <p className="mt-3 max-w-[540px] text-base leading-[1.55] text-bark-line">
              Post it once, with a fixed tag list and a description in your own
              words. Seekers find it through natural-language search, on a map
              of the whole west of Singapore.
            </p>
          </div>
          <Link
            href="/post"
            className="inline-flex shrink-0 items-center rounded-full bg-brand px-7 py-3.5 font-display text-[15px] font-semibold text-bone transition-colors hover:bg-brand-light hover:text-bark"
          >
            Post a room
          </Link>
        </section>
      </div>

      {/* The page's own footer. The site one is hidden under `data-landing`:
          this one is set in the landing page's type and aligned to its
          container, and it carries the on-campus line the site footer leaves
          to the listings themselves. */}
      <footer className="border-t border-line-strong">
        <div className={`${CONTAINER} pb-10 pt-7`}>
          <p className="text-[13px] leading-[1.6] text-ink-soft">
            NTU Room Finder is a student project. Listings are posted by users
            and are not verified, endorsed by, or affiliated with NTU. On-campus
            entries are informal student sublets, separate from official hall
            allocation.
          </p>
        </div>
      </footer>
    </div>
  );
}
