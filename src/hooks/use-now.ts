"use client";

import { useSyncExternalStore } from "react";

const HOUR = 60 * 60 * 1000;

/** Wall clock rounded down to the hour, so query args stay stable and cacheable. */
function quantised(): number {
  return Math.floor(Date.now() / HOUR) * HOUR;
}

let snapshot = quantised();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      const next = quantised();
      if (next === snapshot) return;
      snapshot = next;
      listeners.forEach((fn) => fn());
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * A `now` that is safe to pass as a Convex query argument: read outside render, rounded to the
 * hour, and refreshed when the hour turns over. Use it for quota months, plan periods, and
 * anything else the server must not read from its own clock.
 */
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}
