"use client";

import { useActionState, useState } from "react";

import { AddressAutocomplete } from "./address-autocomplete";
import { createListing, type PostListingState } from "@/app/post/actions";
import {
  CATEGORY_LABELS,
  ON_CAMPUS_DISCLAIMER,
  ROOM_TYPE_LABELS,
  TAG_GROUPS,
  TAG_LABELS,
} from "@/lib/constants";
import type { ListingCategory, RoomType } from "@/generated/prisma/enums";

const initialState: PostListingState = {};

export function PostListingForm() {
  const [state, formAction, isPending] = useActionState(
    createListing,
    initialState,
  );
  const [category, setCategory] = useState<ListingCategory>("OFF_CAMPUS");

  return (
    <form action={formAction} className="mt-6 space-y-5">
      {state.error && (
        <div className="rounded-xl border border-brand-line bg-brand-soft px-4 py-3 text-[13px] text-brand">
          {state.error}
        </div>
      )}

      <Section title="The basics">
        <Field label="Title" error={state.fieldErrors?.title}>
          <input
            name="title"
            required
            maxLength={120}
            placeholder="e.g. Quiet common room, 10 min bus to NTU"
            className="field"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" error={state.fieldErrors?.category}>
            <select
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ListingCategory)}
              className="field"
            >
              {(Object.keys(CATEGORY_LABELS) as ListingCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Room type" error={state.fieldErrors?.roomType}>
            <select name="roomType" defaultValue="SINGLE" className="field">
              {(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((r) => (
                <option key={r} value={r}>
                  {ROOM_TYPE_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {category === "ON_CAMPUS" && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
            {ON_CAMPUS_DISCLAIMER} It will be labelled this way on your listing.
          </p>
        )}

        <Field
          label="Monthly rent (SGD)"
          error={state.fieldErrors?.price}
          hint="Just the number, no dollar sign."
        >
          <input
            name="price"
            type="number"
            required
            min={0}
            max={3000}
            step={10}
            placeholder="700"
            className="field sm:max-w-[200px]"
          />
        </Field>
      </Section>

      <Section
        title="Address"
        subtitle="Used once to work out the commute to NTU. Only the approximate area is shown publicly until you start a chat."
      >
        <Field label="Full address" error={state.fieldErrors?.address}>
          <AddressAutocomplete error={state.fieldErrors?.lat} />
        </Field>
      </Section>

      <Section
        title="Description"
        subtitle="Write it like you'd describe it to a friend. The matching model reads this, so quirks and honesty help more than buzzwords."
      >
        <Field label="Description" error={state.fieldErrors?.description} hideLabel>
          <textarea
            name="description"
            required
            rows={7}
            minLength={30}
            maxLength={4000}
            placeholder="What the room is like, who else lives there, the neighbourhood, any house rules, how long the lease can run..."
            className="field resize-y leading-relaxed"
          />
        </Field>
      </Section>

      <Section
        title="Tags"
        subtitle="Tick everything that genuinely applies. These are used as hard filters when seekers search."
      >
        <div className="space-y-4">
          {TAG_GROUPS.map((group) => (
            <fieldset key={group.label}>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                {group.label}
              </legend>
              <div className="flex flex-wrap gap-2">
                {group.tags.map((tag) => (
                  <label
                    key={tag}
                    className="group cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      name="tags"
                      value={tag}
                      className="peer sr-only"
                    />
                    <span className="inline-flex items-center rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-soft transition-colors hover:border-line-strong peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">
                      {TAG_LABELS[tag]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </Section>

      <div className="flex items-center gap-3 border-t border-line pt-5">
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? "Publishing..." : "Publish listing"}
        </button>
        <p className="text-xs text-ink-faint">
          You can deactivate it later from your listings.
        </p>
      </div>
    </form>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <h2 className="text-[15px] font-semibold tracking-tight text-ink">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          {subtitle}
        </p>
      )}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  error,
  hideLabel = false,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className={
          hideLabel
            ? "sr-only"
            : "mb-1.5 block text-xs font-medium text-ink-soft"
        }
      >
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="mt-1.5 block text-xs text-ink-faint">{hint}</span>
      )}
      {error && <span className="mt-1.5 block text-xs text-brand">{error}</span>}
    </label>
  );
}
