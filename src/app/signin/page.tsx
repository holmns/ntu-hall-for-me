import Link from "next/link";
import { redirect } from "next/navigation";

import {
  DemoSignInButton,
  GoogleSignInButton,
} from "@/components/auth-buttons";
import { allowDemoLogin, getCurrentUser, hasGoogleAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SignInPage(props: PageProps<"/signin">) {
  const sp = await props.searchParams;
  const raw = Array.isArray(sp.callbackUrl) ? sp.callbackUrl[0] : sp.callbackUrl;
  // Only allow same-origin relative paths as a redirect target.
  const callbackUrl = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  const user = await getCurrentUser();
  if (user) redirect(callbackUrl);

  const demoAccounts = allowDemoLogin
    ? await prisma.user.findMany({
        where: { email: { contains: "@demo." } },
        select: { email: true, name: true, role: true },
        orderBy: { role: "asc" },
        take: 4,
      })
    : [];

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-16 sm:px-6">
      <div className="text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand text-lg font-bold text-white">
          N
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">
          Sign in
        </h1>
        <p className="mt-1.5 text-[14px] text-ink-soft">
          You need an account to post a room or message a provider.
        </p>
      </div>

      <div className="card mt-6 p-5">
        {hasGoogleAuth ? (
          <GoogleSignInButton callbackUrl={callbackUrl} />
        ) : (
          <>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-amber-900">
              <span className="font-medium">Demo mode.</span> Google OAuth is not
              configured, so you can sign in as a seeded account without a
              password. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to switch
              to real Google sign-in.
            </div>

            <div className="mt-4 space-y-2">
              <DemoSignInButton
                email="seeker@demo.ntu"
                label="Demo Seeker"
                hint="Looking for a room"
                callbackUrl={callbackUrl}
              />
              {demoAccounts
                .filter((a) => a.email !== "seeker@demo.ntu")
                .slice(0, 3)
                .map((account) => (
                  <DemoSignInButton
                    key={account.email}
                    email={account.email!}
                    label={account.name ?? account.email!}
                    hint="Has listings posted"
                    callbackUrl={callbackUrl}
                  />
                ))}
            </div>
          </>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-ink-faint">
        <Link href="/" className="hover:text-ink-soft hover:underline">
          Back to home
        </Link>
      </p>
    </div>
  );
}
