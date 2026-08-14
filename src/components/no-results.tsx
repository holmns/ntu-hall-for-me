"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Which constraint a button drops, and the params that express it. Keyed
 * rather than passed as raw param names so the caller describes intent
 * ("the price range") and this owns the fact that it takes two params.
 */
const PARAMS: Record<string, string[]> = {
  price: ["min", "max"],
  category: ["category"],
  roomType: ["roomType"],
  tags: ["tag"],
  commute: ["commute", "mode"],
  area: ["area"],
};

export type Removable = { key: keyof typeof PARAMS & string; label: string };

/**
 * The empty results state.
 *
 * It used to read "Try widening the budget or clearing a filter", which is
 * advice where a control belongs - it names the fix and then makes the seeker
 * go and perform it. Everything here is one press, and only constraints that
 * are actually set are offered, so the panel never suggests removing something
 * that is not there.
 *
 * The model's own guesses are already gone by this point: the relaxation
 * ladder drops its commute limit, demotes its must-have tags and stretches its
 * budget before giving up. Anything still narrowing the search is something
 * the seeker set themselves, which is exactly what these buttons undo.
 */
export function NoResults({ removable }: { removable: Removable[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function drop(keys: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of keys) {
      for (const param of PARAMS[key] ?? []) params.delete(param);
    }
    startTransition(() => {
      const query = params.toString();
      router.push(query ? `/search?${query}` : "/search");
    });
  }

  return (
    <div
      className={`card mt-3 px-6 py-10 text-center transition-opacity ${
        pending ? "opacity-60" : ""
      }`}
    >
      <p className="text-[15px] font-medium text-ink">No rooms found</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-soft">
        {removable.length > 0
          ? "Nothing matches everything you asked for. Drop one of these and try again."
          : "Nothing is listed that fits. Try describing the room differently."}
      </p>

      {removable.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {removable.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => drop([item.key])}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-soft transition-colors hover:border-brand-line hover:bg-brand-soft hover:text-brand"
            >
              {item.label}
            </button>
          ))}

          {/* Only worth its own button when there is more than one thing to
              clear; with a single constraint it would duplicate the button
              beside it. */}
          {removable.length > 1 && (
            <button
              type="button"
              onClick={() => drop(removable.map((r) => r.key))}
              className="rounded-full border border-brand bg-brand-soft px-3 py-1.5 text-[13px] font-medium text-brand transition-colors hover:bg-brand-soft/70"
            >
              Clear everything
            </button>
          )}
        </div>
      )}
    </div>
  );
}
