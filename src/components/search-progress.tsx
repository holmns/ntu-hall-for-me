"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Whether a search is currently in flight, shared between the search box and
 * the results it is waiting on.
 *
 * It cannot be component state or context state, because the two ends live on
 * different sides of a route boundary: the box is mounted by the landing page
 * when the search starts and re-mounted by /search a moment later, while the
 * thing that knows the rooms have arrived is a server component streaming into
 * a Suspense boundary further down the tree. A module-level store outlives the
 * navigation that a provider in between would not survive.
 *
 * "In flight" here means the rooms, not the per-room reasons: the reasons
 * stream in about a second after the cards land (see `searchListings`), and the
 * box should settle when the seeker has something to read, not when the last
 * caption arrives.
 */
let running = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (running === next) return;
  running = next;
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

export function startSearch() {
  set(true);
}

export function endSearch() {
  set(false);
}

/**
 * Always false on the server. The box renders unlit in the HTML and lights up
 * on the client if a search really is running, which is the only order that
 * hydrates cleanly.
 */
export function useSearchRunning(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => running,
    () => false,
  );
}

/**
 * Rendered by the results skeleton, which is the one place that knows a search
 * is running that nobody in this tab started - a shared `/search?q=...` link,
 * or a reload. Pressing enter arms the box directly instead, because the
 * skeleton never appears on a navigation from an already-loaded page.
 */
export function SearchStarted() {
  useEffect(() => {
    startSearch();
  }, []);
  return null;
}

/**
 * Rendered next to whatever the search produced - rooms, an empty result, or
 * the error boundary. Deliberately has no dependency array: a second search
 * from the results page re-renders this same mounted component, and that render
 * is the signal that the new rooms are on screen.
 */
export function SearchSettled() {
  useEffect(() => {
    endSearch();
  });
  return null;
}
