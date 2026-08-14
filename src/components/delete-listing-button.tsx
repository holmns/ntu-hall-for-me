"use client";

import { useActionState, useId, useRef } from "react";

import { deleteListing } from "@/app/listings/[id]/edit/actions";

/**
 * Owner-only delete, behind a confirmation that names what it destroys.
 *
 * The dialog is a native `<dialog>`: the focus trap, Esc and the top layer
 * (so it is never clipped by the card it sits in) come for free, and unlike
 * `window.confirm` it can spell out that the chat threads go too.
 */
export function DeleteListingButton({
  listingId,
  title,
  photoCount,
  threadCount,
  isActive,
  variant = "prominent",
}: {
  listingId: string;
  title: string;
  photoCount: number;
  threadCount: number;
  /** Deactivating is only worth suggesting to someone who has not already. */
  isActive: boolean;
  /** "quiet" sits inline with the other row actions on /my-listings. */
  variant?: "prominent" | "quiet";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [state, formAction, isPending] = useActionState(deleteListing, {});

  function close() {
    // Closing mid-request would hide the outcome, including a failure.
    if (!isPending) dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={
          variant === "prominent"
            ? "inline-flex items-center justify-center gap-2 rounded-[10px] border border-brand-line bg-surface px-4 py-2.5 text-[15px] font-[550] text-brand-ink transition-colors hover:bg-brand-soft"
            : "rounded-lg px-3 py-1.5 text-[13px] text-ink-soft transition-colors hover:bg-brand-soft hover:text-brand-ink"
        }
      >
        Delete{variant === "prominent" ? " listing" : ""}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={headingId}
        onCancel={(event) => {
          if (isPending) event.preventDefault();
        }}
        onClick={(event) => {
          // Clicks on the backdrop land on the dialog element itself.
          if (event.target === dialogRef.current) close();
        }}
        className="m-auto w-[min(27rem,calc(100vw-2rem))] rounded-[14px] border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-ink/40"
      >
        <div className="p-5">
          <h2
            id={headingId}
            className="text-[16px] font-semibold tracking-tight text-ink"
          >
            Delete this listing?
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
            <span className="font-medium break-words text-ink">{title}</span> is
            removed for good.
          </p>

          <ul className="mt-3 space-y-1.5 rounded-xl border border-brand-line bg-brand-soft px-3.5 py-3 text-[13px] leading-relaxed text-ink-soft">
            {photoCount > 0 && (
              <Consequence>
                {photoCount === 1
                  ? "Its photo is deleted from storage."
                  : `Its ${photoCount} photos are deleted from storage.`}
              </Consequence>
            )}
            {threadCount > 0 ? (
              <Consequence>
                {threadCount === 1
                  ? "The one chat thread about this room disappears - for the other person too, without warning."
                  : `All ${threadCount} chat threads about this room disappear - for the other people too, without warning.`}
              </Consequence>
            ) : (
              <Consequence>
                Its page stops existing, so a saved link 404s.
              </Consequence>
            )}
            <Consequence>None of this can be undone.</Consequence>
          </ul>

          {isActive && (
            <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
              If the room is simply taken, hiding it instead keeps your chats
              and can be reversed later.
            </p>
          )}

          {state.error && (
            <p className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-[13px] text-brand-ink">
              {state.error}
            </p>
          )}

          <form action={formAction} className="mt-4 flex justify-end gap-2">
            <input type="hidden" name="listingId" value={listingId} />
            <input type="hidden" name="confirm" value="delete" />
            <button
              type="button"
              onClick={close}
              disabled={isPending}
              className="btn-secondary"
            >
              Keep listing
            </button>
            <button type="submit" disabled={isPending} className="btn-primary">
              {isPending ? "Deleting..." : "Delete permanently"}
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}

function Consequence({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span
        aria-hidden="true"
        className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand"
      />
      <span>{children}</span>
    </li>
  );
}
