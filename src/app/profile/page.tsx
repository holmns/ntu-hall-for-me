import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { countSaved } from "@/lib/saved";
import { ROLE_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?callbackUrl=/profile");

  const [account, listings, saved, threads] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true, image: true, role: true, createdAt: true },
    }),
    prisma.listing.count({ where: { providerId: user.id } }),
    countSaved(user.id),
    prisma.message.count({
      where: { OR: [{ senderId: user.id }, { receiverId: user.id }] },
    }),
  ]);
  if (!account) redirect("/signin?callbackUrl=/profile");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Profile</h1>

      <div className="card mt-6 p-5">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-line">
            {account.image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={account.image}
                alt=""
                width={64}
                height={64}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="grid h-full w-full place-items-center bg-brand-soft text-xl font-semibold text-brand">
                {(account.name ?? account.email ?? "?").charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold tracking-tight text-ink">
              {account.name ?? "Unnamed"}
            </p>
            {account.email && (
              <p className="truncate text-[13px] text-ink-soft">
                {account.email}
              </p>
            )}
            <p className="mt-1.5 inline-flex rounded-full border border-line bg-surface-muted px-2.5 py-0.5 text-[11px] font-medium text-ink-soft">
              {ROLE_LABELS[account.role]}
            </p>
          </div>
        </div>

        <p className="mt-4 border-t border-line pt-3 text-[13px] text-ink-faint">
          Joined{" "}
          {account.createdAt.toLocaleDateString("en-SG", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          . Your name and picture come from the Google account you signed in
          with.
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Stat label="Rooms posted" value={listings} href="/my-listings" />
        <Stat label="Rooms saved" value={saved} href="/saved" />
        <Stat label="Messages" value={threads} href="/messages" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/settings" className="btn-secondary">
          Settings
        </Link>
        <Link href="/post" className="btn-secondary">
          Post a room
        </Link>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="card p-4 transition-colors hover:border-line-strong"
    >
      <span className="block text-2xl font-semibold tabular-nums text-ink">
        {value}
      </span>
      <span className="mt-0.5 block text-[13px] text-ink-soft">{label}</span>
    </Link>
  );
}
