"use client";

import { useSortControl } from "@/components/results-view";
import type { SortOrder } from "@/lib/matching";

/**
 * Ordering, beside the result count rather than inside the filter panel: it
 * is not a filter, it changes nothing about which rooms are shown, and every
 * rental site in the category puts it here.
 *
 * Pills rather than a dropdown, matching the rest of the app's vocabulary, and
 * because four options are cheaper to read than to open.
 */
export function SortSelect({
  /**
   * Whether the seeker typed anything. Without a query there is no ranking to
   * be best at - the pipeline skips the parse, the embedding and the reasons,
   * and orders by date - so offering "Best match" would be naming the same
   * ordering as "Newest" twice.
   */
  hasQuery,
}: {
  hasQuery: boolean;
}) {
  // The order lives in ResultsView, which is what holds every room's price and
  // date and can therefore reorder the page without asking the server.
  const { sort, choose } = useSortControl();

  // The unset state is always the first pill; only its name changes. With no
  // query the pipeline already orders by date, so unset *is* newest - saying
  // "Best match" there would name one ordering twice, and leaving the option
  // out entirely would leave the current state with no pill to light up.
  const options: { value: SortOrder | ""; label: string }[] = hasQuery
    ? [
        { value: "", label: "Best match" },
        { value: "price_asc", label: "Price: low to high" },
        { value: "price_desc", label: "Price: high to low" },
        { value: "newest", label: "Newest" },
      ]
    : [
        { value: "", label: "Newest" },
        { value: "price_asc", label: "Price: low to high" },
        { value: "price_desc", label: "Price: high to low" },
      ];

  const current = sort ?? "";

  return (
    // No pending state: the reorder is instant, so dimming the control would
    // be inventing a wait that is not happening.
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-ink-faint">Sort</span>
      {options.map((option) => {
        const active = current === option.value;
        return (
          <button
            key={option.value || "best"}
            type="button"
            aria-pressed={active}
            onClick={() => choose(option.value || null)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              active
                ? "border-brand bg-brand-soft font-medium text-brand-ink"
                : "border-line bg-surface text-ink-soft hover:border-line-strong hover:bg-surface-muted"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
