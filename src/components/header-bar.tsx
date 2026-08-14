"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { UserMenu } from "./user-menu";

/** The bar's own height, as a margin the hero has to clear before the skin
 *  swaps. Matches the `h-14` below; there is no way to read a Tailwind class
 *  from an observer, so the two are kept in step by hand. */
const BAR_H = 56;

/**
 * The bar itself. Split out of `SiteHeader` as a client component for one
 * reason: the landing page's hero runs to the very top of the document with the
 * bar sitting on the photo, so the bar has to know which route is under it, and
 * the root layout that renders it does not.
 *
 * A `:has()` rule in globals.css does this job for the browse shell, but that
 * one only has to drop a max width. Here every colour in the bar changes, and
 * restating the whole thing in CSS to override Tailwind's utilities would leave
 * two descriptions of the same bar to keep in step.
 *
 * The user is still read on the server; only the choice of skin is client-side.
 *
 * There is **one** bar design, in two skins:
 *
 * - the *overlay* skin - transparent, cream type - which exists only while the
 *   bar is on the landing page's hero photo;
 * - the *solid* skin - sand at 85% behind a blur, hairline under it - which is
 *   every other page, and the landing page once the hero has scrolled past.
 *
 * Geometry is identical between them (same 3.5rem bar, same gaps, same pill
 * padding), so the landing swap is a colour change and nothing moves. The
 * 3.5rem is also load-bearing off-screen: `/search` sizes its viewport-locked
 * shell as `calc(100vh-3.5rem)`.
 */
export function HeaderBar({
  user,
  signOut,
}: {
  user: { name: string | null; email: string | null; image: string | null } | null;
  signOut: ReactNode;
}) {
  const pathname = usePathname();
  const landing = pathname === "/";
  const [scrolled, setScrolled] = useState(false);

  // Only the landing page has a skin that depends on scroll position; every
  // other route is solid from the first pixel and does not need the observer.
  //
  // The cream skin belongs to the photo, so what decides it is the hero's own
  // edge rather than a pixel count: shrink the viewport by the bar's height and
  // ask whether the hero still reaches into it. A scroll listener could compute
  // the same thing, but only by measuring the hero on every frame and again on
  // every resize - this fires twice per visit, at the crossing.
  useEffect(() => {
    if (!landing) return;

    const hero = document.querySelector("[data-hero]");
    // No hero to sit on, so nothing to be transparent over: fall back to the
    // solid skin rather than leaving cream type on sand. The state has to start
    // the other way round - the observer's first callback lands after paint,
    // and defaulting to solid would flash a sand bar across the photo on every
    // load. This correction runs once and cannot re-enter, which is what the
    // rule below is guarding against.
    if (!hero) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScrolled(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { rootMargin: `-${BAR_H}px 0px 0px 0px` },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [landing]);

  const overlay = landing && !scrolled;

  // The landing bar is `fixed`, not `sticky`: it is rendered by the root layout
  // *above* the page, so in normal flow it would push the hero down and leave a
  // strip of sand over the photo. Out of flow it sits on the hero, and stays on
  // screen once the hero has gone - which is the whole point of the change.
  // Everywhere else the bar has content under it rather than behind it, so
  // sticky is right and keeps the page from starting underneath the bar.
  const header = [
    landing ? "fixed" : "sticky",
    "inset-x-0 top-0 z-30 border-b transition-colors duration-200",
    overlay
      ? "border-transparent bg-transparent"
      : "border-line bg-canvas/85 backdrop-blur-md",
  ].join(" ");

  // `site-bar` is the hook globals.css uses to drop the max width on the
  // full-bleed browse page - a 1152px bar of links floating over a map that
  // runs to both edges reads as a broken layout.
  //
  // The landing page is the one route with a 1240px container of its own, so
  // its bar matches that rather than the app's 1152px. The alternative is a
  // logo that does not line up with the headline underneath it.
  const bar = landing
    ? "mx-auto flex h-14 max-w-[1240px] items-center gap-4 px-4 sm:px-6 lg:px-12"
    : "site-bar mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6";

  const link = [
    "whitespace-nowrap rounded-full px-3 py-2 transition-colors sm:px-3.5",
    overlay
      ? "on-photo-text text-cream hover:bg-canvas/20"
      : "text-ink-soft hover:bg-surface-muted hover:text-ink",
  ].join(" ");

  return (
    <header className={header}>
      <div className={bar}>
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span
            className={`grid h-[30px] w-[30px] place-items-center rounded-full font-display text-[14px] font-extrabold transition-colors duration-200 ${
              overlay
                ? "on-photo-shape bg-canvas text-brand-ink"
                : "bg-brand text-bone"
            }`}
          >
            N
          </span>
          <span
            className={`font-display text-[16px] font-bold tracking-[-0.02em] transition-colors duration-200 ${
              overlay ? "on-photo-text text-canvas" : "text-ink"
            }`}
          >
            Room Finder
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
          <Link href="/search" className={link}>
            Browse
          </Link>
          {user ? (
            <>
              <Link href="/messages" className={link}>
                Messages
              </Link>
              <Link href="/post" className={link}>
                Post<span className="hidden sm:inline"> a room</span>
              </Link>
              {/* Saved rooms, your listings, profile, settings and sign out all
                  live behind this, which is what keeps the bar to three items
                  on a phone. */}
              <UserMenu
                name={user.name}
                email={user.email}
                image={user.image}
                signOut={signOut}
                overlay={overlay}
              />
            </>
          ) : (
            <Link
              href="/signin"
              className={
                overlay
                  ? "on-photo-shape ml-1 inline-flex items-center whitespace-nowrap rounded-full bg-canvas px-5 py-2.5 font-display text-sm font-semibold text-brand-ink transition-colors hover:bg-cream"
                  : "btn-primary ml-1 whitespace-nowrap !px-5 !py-2"
              }
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
