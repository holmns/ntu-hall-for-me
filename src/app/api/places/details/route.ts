import { NextResponse } from "next/server";

import { getPlaceDetail } from "@/lib/maps";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("placeId");
  const sessionToken = searchParams.get("session") ?? undefined;
  if (!placeId) {
    return NextResponse.json({ error: "placeId is required" }, { status: 400 });
  }

  const detail = await getPlaceDetail(placeId, sessionToken);
  if (!detail) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
