import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { listThreads } from "@/lib/conversations";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?callbackUrl=/messages");

  const threads = await listThreads(user.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Messages
      </h1>
      <p className="mt-1.5 text-[14px] text-ink-soft">
        One thread per room you have talked to someone about.
      </p>

      {threads.length === 0 ? (
        <div className="card mt-6 px-6 py-14 text-center">
          <p className="text-[15px] font-medium text-ink">No messages yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-soft">
            Find a room you like and message the provider. Threads show up here.
          </p>
          <Link href="/search" className="btn-secondary mt-5">
            Browse rooms
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {threads.map((thread) => (
            <li key={`${thread.listingId}:${thread.peerId}`}>
              <Link
                href={`/messages/${thread.listingId}/${thread.peerId}`}
                className="card block p-4 transition-colors hover:border-line-strong"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-ink">
                      {thread.listingTitle}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      with {thread.peerName}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-ink-faint">
                    {thread.lastAt.toLocaleDateString("en-SG", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
                <p className="mt-2 line-clamp-1 text-[13px] text-ink-soft">
                  {thread.unreadFromPeer ? "" : "You: "}
                  {thread.lastMessage}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
