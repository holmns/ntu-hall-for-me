import Link from "next/link";

import { getCurrentUser } from "@/lib/auth";
import { SignOutButton } from "./auth-buttons";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-[13px] font-bold text-white">
            N
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            Room Finder
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1 text-sm">
          <Link
            href="/search"
            className="rounded-lg px-3 py-1.5 text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
          >
            Browse
          </Link>
          {user ? (
            <>
              <Link
                href="/messages"
                className="rounded-lg px-3 py-1.5 text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
              >
                Messages
              </Link>
              <Link
                href="/post"
                className="rounded-lg px-3 py-1.5 text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
              >
                Post a room
              </Link>
              <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
              <span className="hidden max-w-[12ch] truncate text-ink-faint sm:block">
                {user.name ?? user.email}
              </span>
              <SignOutButton />
            </>
          ) : (
            <Link href="/signin" className="btn-primary ml-1 !px-4 !py-1.5">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
