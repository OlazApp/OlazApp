"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Board } from "@/lib/board";

/*
 * One poll of /api/board for the whole page: the header tape, the board, the
 * market pages and the dock all read the same snapshot.
 */

type BoardState = { board: Board | null; failed: boolean; refresh: () => void };
const BoardContext = createContext<BoardState>({ board: null, failed: false, refresh: () => {} });

const POLL_MS = 5000;

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const load = async () => {
      if (!document.hidden || !board) {
        try {
          const res = await fetch("/api/board", { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const body = (await res.json()) as Board;
          if (!cancelled) {
            setBoard(body);
            setFailed(false);
          }
        } catch {
          if (!cancelled) setFailed(true);
        }
      }
      if (!cancelled) timer = window.setTimeout(load, POLL_MS);
    };
    load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return <BoardContext.Provider value={{ board, failed, refresh: () => setTick((n) => n + 1) }}>{children}</BoardContext.Provider>;
}

export const useBoard = () => useContext(BoardContext);

/** Current time, re-rendered every second (null during server render). */
export function useNow(step = 1000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const read = () => setNow(Date.now());
    const first = window.setTimeout(read, 0);
    const t = window.setInterval(read, step);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, [step]);
  return now;
}
