import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ChatThread } from "@/components/chat-thread";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getThreadMessages } from "@/lib/conversations";

export const dynamic = "force-dynamic";

export default async function ThreadPage(
  props: PageProps<"/messages/[listingId]/[peerId]">,
) {
  const { listingId, peerId } = await props.params;

  const user = await getCurrentUser();
  if (!user) redirect(`/signin?callbackUrl=/messages/${listingId}/${peerId}`);

  const [listing, peer] = await Promise.all([
    prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, title: true, price: true, providerId: true },
    }),
    prisma.user.findUnique({
      where: { id: peerId },
      select: { id: true, name: true, email: true },
    }),
  ]);
  if (!listing || !peer) notFound();

  // Threads only exist between a seeker and that listing's provider.
  const viewerIsProvider = listing.providerId === user.id;
  if (!viewerIsProvider && peerId !== listing.providerId) notFound();
  if (peerId === user.id) notFound();

  const messages = await getThreadMessages(listingId, user.id, peerId);
  const peerName = peer.name ?? peer.email ?? "Provider";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link
        href="/messages"
        className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft transition-colors hover:text-ink"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        All messages
      </Link>

      <div className="card mt-4 flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-xs text-ink-faint">
            {viewerIsProvider ? "Enquiry from" : "Chatting with"} {peerName}
          </p>
          <Link
            href={`/listings/${listing.id}`}
            className="mt-0.5 block truncate text-[15px] font-semibold text-ink hover:text-brand-ink"
          >
            {listing.title}
          </Link>
        </div>
        <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">
          ${listing.price.toLocaleString()}
        </span>
      </div>

      <div className="mt-3">
        <ChatThread
          listingId={listing.id}
          peerId={peerId}
          peerName={peerName}
          currentUserId={user.id}
          initialMessages={messages.map((m) => ({
            id: m.id,
            content: m.content,
            senderId: m.senderId,
            createdAt: m.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
