import Link from "next/link";
import { redirect } from "next/navigation";

import { GoogleSignInButton } from "@/components/auth-buttons";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SignInPage(props: PageProps<"/signin">) {
  const sp = await props.searchParams;
  const raw = Array.isArray(sp.callbackUrl) ? sp.callbackUrl[0] : sp.callbackUrl;
  // Only allow same-origin relative paths as a redirect target.
  const callbackUrl = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  const user = await getCurrentUser();
  if (user) redirect(callbackUrl);

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-16 sm:px-6">
      <div className="text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-brand text-lg font-bold text-bone">
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
        <GoogleSignInButton callbackUrl={callbackUrl} />
      </div>

      <p className="mt-4 text-center text-xs text-ink-faint">
        <Link href="/" className="hover:text-ink-soft hover:underline">
          Back to home
        </Link>
      </p>
    </div>
  );
}
