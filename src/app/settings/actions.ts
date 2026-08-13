"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import type { Role } from "@/generated/prisma/enums";

const ROLES: Role[] = ["SEEKER", "PROVIDER", "BOTH"];

export type SettingsState = { ok?: boolean; error?: string };

/**
 * Changes how the account describes itself. Nothing is gated on the role - a
 * seeker can still post a room, and `createListing` promotes them when they do
 * - so this is a label, not a permission.
 *
 * Reachable by direct POST like every other action, hence the auth check and
 * the enum whitelist rather than trusting the submitted string.
 */
export async function updateRole(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return { error: "You need to be signed in to change this." };
  }

  const role = String(formData.get("role") ?? "") as Role;
  if (!ROLES.includes(role)) {
    return { error: "That is not a valid choice. Please reload." };
  }

  await prisma.user.update({ where: { id: user.id }, data: { role } });

  revalidatePath("/settings");
  revalidatePath("/profile");
  return { ok: true };
}
