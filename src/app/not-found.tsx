import Link from "next/link";

/**
 * The root 404. It also catches `notFound()` from the listing, edit and thread
 * pages, which call it for a room that does not exist *and* for one the viewer
 * has no business seeing - so the copy stays about the address being wrong and
 * never confirms that an id exists.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="card mt-6 px-6 py-14 text-center">
        <p className="text-[12px] font-semibold tracking-[0.14em] text-ink-faint uppercase">
          404
        </p>
        {/* Archivo comes from the base layer, so this needs no display class. */}
        <h1 className="mt-3 text-[15px] font-medium text-ink">Page not found</h1>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-soft">
          This page does not exist, or the room it pointed to has been taken
          down by whoever posted it.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/search" className="btn-primary">
            Browse rooms
          </Link>
          <Link href="/" className="btn-secondary">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
