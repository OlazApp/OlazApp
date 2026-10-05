"use client";

import { useCallback, useEffect, useState } from "react";

/*
 * Per-viewer conveniences kept in this browser only (watchlist, default
 * stake, time display, read marks). Every access is guarded: private windows
 * and blocked storage simply fall back to the default.
 */

const EVENT = "olaz:local";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function useLocal<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    const sync = () => setValue(read(key, fallback));
    const t = window.setTimeout(sync, 0);
    const onEvent = (e: Event) => {
      if ((e as CustomEvent<string>).detail === key) sync();
    };
    window.addEventListener(EVENT, onEvent);
    window.addEventListener("storage", sync);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(EVENT, onEvent);
      window.removeEventListener("storage", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const update = useCallback(
    (next: T | ((current: T) => T)) => {
      const resolved = typeof next === "function" ? (next as (c: T) => T)(read(key, fallback)) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        // Kept for this page view only.
      }
      setValue(resolved);
      window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return [value, update] as const;
}

export const WATCH_KEY = "olaz.watch";
export const STAKE_KEY = "olaz.stake";
export const CLOCK_KEY = "olaz.clock";
export const READ_KEY = "olaz.notes.read";
export const INTRO_KEY = "olaz.intro.done";

export function useWatchlist() {
  const [list, setList] = useLocal<string[]>(WATCH_KEY, []);
  const toggle = (id: string) => setList((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  return { list, toggle, has: (id: string) => list.includes(id) };
}

export type ClockMode = "local" | "utc";

export function useClock() {
  const [mode, setMode] = useLocal<ClockMode>(CLOCK_KEY, "local");
  const time = (at: number, withDate = false) =>
    new Date(at).toLocaleString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...(withDate ? { month: "short", day: "numeric" } : {}),
      ...(mode === "utc" ? { timeZone: "UTC" } : {}),
    }) + (mode === "utc" ? " UTC" : "");
  return { mode, setMode, time };
}
