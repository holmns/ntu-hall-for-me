import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getThreadMessages } from "@/lib/conversations";
import { prisma } from "@/lib/prisma";

/**
 * Polled by the thread view. Supabase Realtime would replace this; polling was
 * the deliberate hackathon choice (see CLAUDE.md).
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/messages/[listingId]/[peerId]">,
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { listingId, peerId } = await ctx.params;

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { providerId: true },
  });
  if (!listing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Only the two participants of this thread may read it.
  const participants = [listing.providerId, peerId, user.id];
  if (!participants.includes(user.id) || (user.id !== listing.providerId && peerId !== listing.providerId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const messages = await getThreadMessages(listingId, user.id, peerId);
  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      content: m.content,
      senderId: m.senderId,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
