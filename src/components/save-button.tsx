"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setListingSaved } from "@/app/saved/actions";

function HeartIcon({ filled, className }: { filled: boolean; className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        d="M12 20.5s-7.5-4.7-7.5-9.8A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 3.1c0 5.1-7.5 9.8-7.5 9.8Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Save/unsave one room.
 *
 * The saved flag is held here rather than read back from the server on every
 * click: the action deliberately revalidates nothing (see `setListingSaved`),
 * so this component owns the truth from the moment the user clicks. The
 * "adjust state when a prop changes" pattern below re-syncs it when the server
 * does send a fresh value, e.g. after a navigation or a `router.refresh()`.
 */
export function SaveButton({
  listingId,
  saved,
  signedIn,
  callbackUrl,
  variant = "icon",
  refreshAfter = false,
}: {
  listingId: string;
  saved: boolean;
  signedIn: boolean;
  /** Where to come back to after signing in. */
  callbackUrl?: string;
  variant?: "icon" | "labelled";
  /** Set on pages whose content depends on the shortlist, i.e. `/saved`. */
  refreshAfter?: boolean;
}) {
  const router = useRouter();
  const [isSaved, setIsSaved] = useState(saved);
  const [lastProp, setLastProp] = useState(saved);
  const [pending, startTransition] = useTransition();

  if (lastProp !== saved) {
    setLastProp(saved);
    setIsSaved(saved);
  }

  const label = isSaved ? "Saved" : "Save";
  const icon = "h-4 w-4";

  if (!signedIn) {
    const href = `/signin?callbackUrl=${encodeURIComponent(
      callbackUrl ?? `/listings/${listingId}`,
    )}`;
    return variant === "icon" ? (
      <Link href={href} aria-label="Sign in to save this room" className={iconClass(false)}>
        <HeartIcon filled={false} className={icon} />
      </Link>
    ) : (
      <Link href={href} className="btn-secondary w-full">
        <HeartIcon filled={false} className={icon} />
        Save
      </Link>
    );
  }

  const onClick = () => {
    const next = !isSaved;
    setIsSaved(next);
    startTransition(async () => {
      try {
        await setListingSaved(listingId, next);
        if (refreshAfter) router.refresh();
      } catch (error) {
        console.error("[save] toggle failed:", error);
        setIsSaved(!next);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={isSaved}
      aria-label={isSaved ? "Remove from saved" : "Save this room"}
      className={
        variant === "icon"
          ? iconClass(isSaved)
          : `btn-secondary w-full ${
              isSaved ? "!border-brand-line !bg-brand-soft !text-brand-ink" : ""
            }`
      }
    >
      <HeartIcon filled={isSaved} className={icon} />
      {variant === "labelled" && label}
    </button>
  );
}

function iconClass(active: boolean): string {
  return `grid h-8 w-8 place-items-center rounded-full border shadow-[0_1px_4px_rgba(28,26,23,0.12)] backdrop-blur-sm transition-colors ${
    active
      ? "border-brand-line bg-brand-soft text-brand-ink"
      : "border-line bg-surface/90 text-ink-faint hover:border-line-strong hover:text-ink"
  }`;
}
