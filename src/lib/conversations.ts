import { prisma } from "./prisma";

/**
 * A thread is identified by (listing, the two participants). The exact address
 * of a listing is only revealed once a thread actually exists, so this is the
 * gate for that.
 */
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
