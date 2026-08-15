"use client";

import { useEffect, useRef, useState } from "react";

import { ImageRejected, prepareImage } from "@/lib/image-resize";
import {
  IMAGE_ACCEPT_ATTR,
  MAX_IMAGES_PER_LISTING,
  type ListingImageView,
} from "@/lib/images";

/**
 * Photo picker for the provider form, used for both posting and editing.
 *
 * One ordered list holds two kinds of tile: photos already in storage and
 * files picked just now. Submitting sends an `imageSlot` field per tile, in
 * display order, so a single POST can express keep, drop, reorder and add
 * together - the server never has to guess what happened between two states.
 *
 * New files are downscaled in the browser and then written back into the file
 * input via DataTransfer, so the form still submits them as ordinary
 * multipart fields and no separate upload endpoint is needed. The input is
 * cleared the moment a selection arrives, so the originals can never be
 * submitted during the resize.
 */

type Slot =
  | { kind: "existing"; key: string; id: string; url: string }
  | {
    kind: "new";
    key: string;
    file: File;
    width: number;
    height: number;
    previewUrl: string;
  };

function slotSrc(slot: Slot): string {
  return slot.kind === "existing" ? slot.url : slot.previewUrl;
}

export function ImageUploader({
  initial = [],
  onBusyChange,
  error,
}: {
  initial?: ListingImageView[];
  onBusyChange?: (busy: boolean) => void;
  error?: string;
}) {
  const [slots, setSlots] = useState<Slot[]>(() =>
    initial.map((image) => ({
      kind: "existing" as const,
      key: image.id,
      id: image.id,
      url: image.url,
    })),
  );
  const [rejections, setRejections] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const slotsRef = useRef(slots);

  // Keep the file input in step with the tiles, including their order. Only
  // new files go in it; kept photos travel as `imageSlot` ids.
  useEffect(() => {
    slotsRef.current = slots;
    const input = inputRef.current;
    if (!input || typeof DataTransfer === "undefined") return;
    const transfer = new DataTransfer();
    for (const slot of slots) {
      if (slot.kind === "new") transfer.items.add(slot.file);
    }
    input.files = transfer.files;
  }, [slots]);

  // Previews of new files are object URLs; drop them when the form goes away.
  // Stored photos are plain URLs and must not be revoked.
  useEffect(
    () => () => {
      for (const slot of slotsRef.current) {
        if (slot.kind === "new") URL.revokeObjectURL(slot.previewUrl);
      }
    },
    [],
  );

  async function addFiles(selection: FileList | File[]) {
    const incoming = Array.from(selection);
    if (incoming.length === 0) return;

    setRejections([]);
    setBusy(true);
    onBusyChange?.(true);

    const accepted: Slot[] = [];
    const refused: string[] = [];
    let room = MAX_IMAGES_PER_LISTING - slots.length;

    for (const file of incoming) {
      if (room <= 0) {
        refused.push(`Only ${MAX_IMAGES_PER_LISTING} photos per listing.`);
        break;
      }
      try {
        const { id, ...prepared } = await prepareImage(file);
        accepted.push({ kind: "new", key: id, ...prepared });
        room -= 1;
      } catch (cause) {
        refused.push(
          cause instanceof ImageRejected
            ? cause.message
            : `${file.name} could not be added`,
        );
      }
    }

    setSlots((prev) => [...prev, ...accepted].slice(0, MAX_IMAGES_PER_LISTING));
    setRejections(refused);
    setBusy(false);
    onBusyChange?.(false);
  }

  function remove(key: string) {
    const target = slots.find((slot) => slot.key === key);
    if (target?.kind === "new") URL.revokeObjectURL(target.previewUrl);
    setSlots((prev) => prev.filter((slot) => slot.key !== key));
    setRejections([]);
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= slots.length) return;
    const next = [...slots];
    [next[index], next[target]] = [next[target], next[index]];
    setSlots(next);
  }

  const full = slots.length >= MAX_IMAGES_PER_LISTING;

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void addFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        name="images"
        accept={IMAGE_ACCEPT_ATTR}
        multiple
        className="sr-only"
        onChange={(event) => {
          const picked = event.target.files;
          if (!picked) return;
          const files = Array.from(picked);
          // Drop the originals immediately: until the resize finishes, this
          // input must not be holding multi-megabyte files a fast submit
          // could send.
          event.target.value = "";
          void addFiles(files);
        }}
      />

      {/* Display order, and which tiles are kept versus newly uploaded. The
          nth "new" here lines up with the nth file in the input above. */}
      {slots.map((slot) => (
        <div key={`slot-${slot.key}`}>
          <input
            type="hidden"
            name="imageSlot"
            value={slot.kind === "existing" ? `keep:${slot.id}` : "new"}
          />
          {slot.kind === "new" && (
            <>
              <input type="hidden" name="imageWidth" value={slot.width} />
              <input type="hidden" name="imageHeight" value={slot.height} />
            </>
          )}
        </div>
      ))}

      {slots.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`flex w-full flex-col items-center justify-center rounded-xl border border-dashed px-6 py-9 text-center transition-colors ${dragging
              ? "border-brand bg-brand-soft"
              : "border-line-strong bg-surface-muted/60 hover:border-line-strong hover:bg-surface-muted"
            }`}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7 text-ink-faint"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="8.5" cy="10" r="1.5" />
            <path d="m4 17 4.5-4.5L12 16l3-3 5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="mt-2.5 text-[14px] font-medium text-ink">
            Drag photos here, or <span className="text-brand-ink">browse</span>
          </span>
          <span className="mt-1 text-xs text-ink-faint">
            JPG, PNG or WebP. Up to {MAX_IMAGES_PER_LISTING} photos.
          </span>
        </button>
      ) : (
        <>
          <ul
            className={`grid grid-cols-2 gap-2.5 rounded-xl sm:grid-cols-3 ${dragging ? "outline-2 outline-offset-4 outline-brand" : ""
              }`}
          >
            {slots.map((slot, index) => (
              <li
                key={slot.key}
                className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-line bg-surface-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slotSrc(slot)}
                  alt=""
                  className="h-full w-full object-cover"
                />

                {index === 0 && (
                  <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-md bg-ink/75 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Cover
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => remove(slot.key)}
                  aria-label={`Remove photo ${index + 1}`}
                  className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md bg-ink/70 text-white transition-colors hover:bg-ink"
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="m4 4 8 8M12 4l-8 8" strokeLinecap="round" />
                  </svg>
                </button>

                <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                  <ReorderButton
                    direction="left"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    label={`Move photo ${index + 1} earlier`}
                  />
                  <ReorderButton
                    direction="right"
                    disabled={index === slots.length - 1}
                    onClick={() => move(index, 1)}
                    label={`Move photo ${index + 1} later`}
                  />
                </div>
              </li>
            ))}

            {!full && (
              <li>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface-muted/60 text-ink-soft transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-ink"
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    aria-hidden="true"
                  >
                    <path d="M8 3.5v9M3.5 8h9" strokeLinecap="round" />
                  </svg>
                  <span className="mt-1 text-[13px] font-medium">Add photos</span>
                </button>
              </li>
            )}
          </ul>

          <p className="mt-2 text-xs text-ink-faint">
            {slots.length} of {MAX_IMAGES_PER_LISTING}. The first photo is the
            cover shown in search results - use the arrows to reorder.
          </p>
        </>
      )}

      {busy && (
        <p className="mt-2 flex items-center gap-2 text-xs text-ink-soft">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
          Resizing photos...
        </p>
      )}

      {rejections.length > 0 && (
        <ul className="mt-2 space-y-1">
          {rejections.map((message) => (
            <li key={message} className="text-xs text-brand-ink">
              {message}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-brand-ink">{error}</p>}
    </div>
  );
}

function ReorderButton({
  direction,
  disabled,
  onClick,
  label,
}: {
  direction: "left" | "right";
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-6 w-6 place-items-center rounded-md bg-ink/70 text-white transition-colors hover:bg-ink disabled:invisible"
    >
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path
          d={direction === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
