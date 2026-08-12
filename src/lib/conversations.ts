import { prisma } from "./prisma";

/** Whether any message exists between two people about a listing. */
export async function hasConversation(
  listingId: string,
  userA: string,
  userB: string,
): Promise<boolean> {
  if (userA === userB) return true;
  const count = await prisma.message.count({
    where: {
      listingId,
      OR: [
        { senderId: userA, receiverId: userB },
        { senderId: userB, receiverId: userA },
      ],
    },
  });
  return count > 0;
}

/**
 * Gate for revealing a listing's exact address and precise map pin.
 *
 * Requires a message in BOTH directions, so the provider has actively replied.
 * A one-sided rule (any message unlocks) would let anyone with an account type
 * "hi" and harvest the address, which is friction rather than consent. Making
 * it mutual means the provider chose to share it with this specific person.
 */
export async function isAddressUnlocked(
  listingId: string,
  viewerId: string,
  providerId: string,
): Promise<boolean> {
  // The provider always sees their own listing in full.
  if (viewerId === providerId) return true;

  const [fromViewer, fromProvider] = await Promise.all([
    prisma.message.count({
      where: { listingId, senderId: viewerId, receiverId: providerId },
    }),
    prisma.message.count({
      where: { listingId, senderId: providerId, receiverId: viewerId },
    }),
  ]);

  return fromViewer > 0 && fromProvider > 0;
}

export async function getThreadMessages(
  listingId: string,
  userA: string,
  userB: string,
) {
  return prisma.message.findMany({
    where: {
      listingId,
      OR: [
        { senderId: userA, receiverId: userB },
        { senderId: userB, receiverId: userA },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      content: true,
      senderId: true,
      createdAt: true,
    },
  });
}

/**
 * How many distinct chat threads exist for each of these listings, seen from
 * the owner's side: one per other person, whichever way the messages went.
 *
 * Exists so a provider can be told what deleting a listing is about to destroy
 * - the messages cascade with the row and there is no undo. `groupBy` rather
 * than `listThreads`'s load-everything approach, because the caller needs a
 * number and not a single line of message content.
 */
export async function countThreadsByListing(
  listingIds: string[],
  ownerId: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (listingIds.length === 0) return counts;

  const pairs = await prisma.message.groupBy({
    by: ["listingId", "senderId", "receiverId"],
    where: { listingId: { in: listingIds } },
  });

  const peers = new Map<string, Set<string>>();
  for (const pair of pairs) {
    const peer = pair.senderId === ownerId ? pair.receiverId : pair.senderId;
    const seen = peers.get(pair.listingId) ?? new Set<string>();
    seen.add(peer);
    peers.set(pair.listingId, seen);
  }
  for (const [listingId, seen] of peers) counts.set(listingId, seen.size);

  return counts;
}

export type ThreadSummary = {
  listingId: string;
  listingTitle: string;
  listingPrice: number;
  peerId: string;
  peerName: string;
  lastMessage: string;
  lastAt: Date;
  unreadFromPeer: boolean;
};

/**
 * Inbox. Groups every message the user is party to into one row per
 * (listing, other person) pair.
 *
 * Cut corner: done in application code over all of the user's messages rather
 * than a windowed SQL query. Fine at hackathon data volumes.
 */
export async function listThreads(userId: string): Promise<ThreadSummary[]> {
  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: userId }, { receiverId: userId }] },
    orderBy: { createdAt: "desc" },
    include: {
      listing: { select: { id: true, title: true, price: true } },
      sender: { select: { id: true, name: true, email: true } },
      receiver: { select: { id: true, name: true, email: true } },
    },
  });

  const threads = new Map<string, ThreadSummary>();
  for (const message of messages) {
    const peer =
      message.senderId === userId ? message.receiver : message.sender;
    const key = `${message.listingId}:${peer.id}`;
    if (threads.has(key)) continue;
    threads.set(key, {
      listingId: message.listingId,
      listingTitle: message.listing.title,
      listingPrice: message.listing.price,
      peerId: peer.id,
      peerName: peer.name ?? peer.email ?? "Someone",
      lastMessage: message.content,
      lastAt: message.createdAt,
      unreadFromPeer: message.senderId !== userId,
    });
  }

  return [...threads.values()].sort(
    (a, b) => b.lastAt.getTime() - a.lastAt.getTime(),
  );
}
