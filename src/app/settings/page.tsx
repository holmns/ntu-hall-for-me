import Link from "next/link";
import { redirect } from "next/navigation";

import { RoleForm } from "@/components/role-form";
import { SignOutButton } from "@/components/auth-buttons";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?callbackUrl=/settings");

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, role: true },
  });
  if (!account) redirect("/signin?callbackUrl=/settings");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Settings
      </h1>

      <section className="card mt-6 p-5">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">
          How you use Room Finder
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          This only labels your account. Anyone can search and anyone can post -
          posting a room updates this for you automatically.
        </p>
        <RoleForm current={account.role} />
      </section>

      <section className="card mt-3 p-5">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">
          Account
        </h2>
        <dl className="mt-3 space-y-2 text-[13px]">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-ink-faint">Signed in with</dt>
            <dd className="truncate text-ink">Google</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-ink-faint">Email</dt>
            <dd className="truncate text-ink">{account.email ?? "Unknown"}</dd>
          </div>
        </dl>
        <p className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-ink-soft">
          Your name, email and picture come from Google and change there, not
          here. To take a room down, hide or delete it from{" "}
          <Link
            href="/my-listings"
            className="font-medium text-brand-ink hover:underline"
          >
            your listings
          </Link>
          .
        </p>
        <div className="mt-4">
          <SignOutButton variant="button" />
        </div>
      </section>
    </div>
  );
}
