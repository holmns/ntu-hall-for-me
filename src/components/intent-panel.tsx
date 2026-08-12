import { CATEGORY_LABELS, ROOM_TYPE_LABELS, TAG_LABELS } from "@/lib/constants";
import type { SeekerIntent } from "@/lib/matching";

const MODE_LABEL = {
  walking: "walking",
  transit: "bus/MRT",
  driving: "driving",
} as const;

/** Shows the seeker what the model understood before it ranked anything. */
export function IntentPanel({
  intent,
  count,
}: {
  intent: SeekerIntent;
  count: number;
}) {
  const chips: string[] = [];
  if (intent.minPrice != null && intent.maxPrice != null) {
    chips.push(`$${intent.minPrice} - $${intent.maxPrice}`);
  } else if (intent.maxPrice != null) {
    chips.push(`Under $${intent.maxPrice}`);
  } else if (intent.minPrice != null) {
    chips.push(`Over $${intent.minPrice}`);
  }
  if (intent.category) chips.push(CATEGORY_LABELS[intent.category]);
  if (intent.roomType) chips.push(ROOM_TYPE_LABELS[intent.roomType]);
  if (intent.maxCommuteMin != null) {
    chips.push(
      `Within ${intent.maxCommuteMin} min ${MODE_LABEL[intent.travelMode ?? "transit"]}`,
    );
  } else if (intent.travelMode) {
    chips.push(`Prefers ${MODE_LABEL[intent.travelMode]}`);
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-muted/60 px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          What we understood
        </span>
      </div>

      <div className="px-4 py-3.5">
        <p className="text-[15px] leading-relaxed text-ink">{intent.summary}</p>

        {(chips.length > 0 ||
          intent.mustHaveTags.length > 0 ||
          intent.niceToHaveTags.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink-soft"
              >
                {chip}
              </span>
            ))}
            {intent.mustHaveTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-brand-line bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand"
              >
                {TAG_LABELS[tag]} (must have)
              </span>
            ))}
            {intent.niceToHaveTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-line bg-surface-muted px-2.5 py-1 text-xs text-ink-soft"
              >
                {TAG_LABELS[tag]}
              </span>
            ))}
          </div>
        )}

        {intent.nuance && (
          <p className="mt-3 text-[13px] text-ink-soft">
            <span className="text-ink-faint">Also weighing:</span>{" "}
            {intent.nuance}
          </p>
        )}

        <p className="mt-3 border-t border-line pt-3 text-[12px] text-ink-faint">
          {count} {count === 1 ? "room passed" : "rooms passed"} the hard
          filters and {count === 1 ? "was" : "were"} ranked by the model.
        </p>
      </div>
    </div>
  );
}
