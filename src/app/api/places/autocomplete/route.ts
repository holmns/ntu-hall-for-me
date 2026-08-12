import { NextResponse } from "next/server";

import { autocompletePlaces } from "@/lib/maps";
import { getCurrentUser } from "@/lib/auth";

/**
 * Proxies Places Autocomplete so the Maps key stays on the server and the
 * dropdown can be styled to match the rest of the app. Signed-in only, since
 * every Places call costs money.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ suggestions: [] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const input = searchParams.get("q") ?? "";
  const sessionToken = searchParams.get("session") ?? undefined;

  const suggestions = await autocompletePlaces(input, sessionToken);
  return NextResponse.json({ suggestions });
}
