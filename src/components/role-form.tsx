"use client";

import { useActionState } from "react";

import { updateRole, type SettingsState } from "@/app/settings/actions";
import { ROLE_HINTS, ROLE_LABELS } from "@/lib/constants";
import type { Role } from "@/generated/prisma/enums";

const ROLES: Role[] = ["SEEKER", "PROVIDER", "BOTH"];
const initialState: SettingsState = {};

export function RoleForm({ current }: { current: Role }) {
  const [state, formAction, isPending] = useActionState(
    updateRole,
    initialState,
  );

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <fieldset className="space-y-2">
        <legend className="sr-only">How you use Room Finder</legend>
        {ROLES.map((role) => (
          <label
            key={role}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-3.5 transition-colors hover:border-line-strong has-checked:border-brand has-checked:bg-brand-soft"
          >
            <input
              type="radio"
              name="role"
              value={role}
              defaultChecked={role === current}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
            />
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-ink">
                {ROLE_LABELS[role]}
              </span>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-soft">
                {ROLE_HINTS[role]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? "Saving..." : "Save"}
        </button>
        {state.ok && !isPending && (
          <span className="text-[13px] text-accent">Saved.</span>
        )}
        {state.error && (
          <span className="text-[13px] text-brand">{state.error}</span>
        )}
      </div>
    </form>
  );
}
