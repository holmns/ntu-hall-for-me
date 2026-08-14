"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

const ITEMS = [
  { href: "/profile", label: "Profile" },
  { href: "/saved", label: "Saved rooms" },
  { href: "/my-listings", label: "Your listings" },
  { href: "/settings", label: "Settings" },
];

/**
 * The account button in the header: a profile picture that opens a menu.
 *
 * Replaces the name-plus-sign-out pair that used to sit in the nav bar. That
 * cost two slots for one account, which is what pushed "Your listings" off
 * mobile; folding everything behind the avatar puts it back within reach on a
 * phone.
 *
 * `signOut` is passed in as a node because signing out is a server action, and
 * this component has to be a client one to own the open/closed state.
 */
export function UserMenu({
  name,
  email,
  image,
  signOut,
  overlay = false,
}: {
  name: string | null;
  email: string | null;
  image: string | null;
  signOut: ReactNode;
  /**
   * The button sits on the landing page's hero photo rather than on the canvas.
   * Only the ring around the avatar changes: the menu itself drops onto the
   * page below and stays the app's own panel.
   */
  overlay?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);

  // Client navigation keeps this component mounted, so the menu has to notice
  // the page changed under it. Adjusted during render rather than in an effect,
  // which would paint the open menu once on the new page first.
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const label = name ?? email ?? "Your account";

  return (
    <div ref={wrapRef} className="relative ml-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className={`grid h-8 w-8 place-items-center overflow-hidden rounded-full border transition-colors ${
          open
            ? "border-brand ring-2 ring-brand-soft"
            : overlay
              ? // `on-photo-shape` lifts the ring off the photo the same way
                // the logo disc and the nav links are lifted. It is dropped
                // while the menu is open, where the brand ring says the same
                // thing louder and the two shadows would stack.
                "on-photo-shape border-canvas/60 hover:border-canvas"
              : "border-line hover:border-line-strong"
        }`}
      >
        <Avatar name={label} image={image} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-[0_8px_28px_rgba(28,26,23,0.14)]"
        >
          <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-line">
              <Avatar name={label} image={image} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-ink">
                {name ?? "Your account"}
              </span>
              {email && (
                <span className="block truncate text-[11px] text-ink-faint">
                  {email}
                </span>
              )}
            </span>
          </div>

          <div className="py-1">
            {ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-3.5 py-2 text-[13px] text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="border-t border-line py-1">{signOut}</div>
        </div>
      )}
    </div>
  );
}

function Avatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={image}
        alt=""
        width={36}
        height={36}
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <span className="grid h-full w-full place-items-center bg-brand-soft text-[13px] font-semibold text-brand-ink">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
