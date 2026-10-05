"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { PracticeGate } from "@/components/practice/Gate";
import { positionHref, positionTitle } from "@/components/practice/positionLabel";
import { useNow } from "@/components/providers/BoardProvider";
import { usePractice } from "@/components/providers/PracticeProvider";
import { READ_KEY, useLocal } from "@/components/providers/useLocal";
import { ago, fmtEth, fromMicro } from "@/lib/rounds";

/** Settlements of your own practice positions, newest first. */
export function Notifications() {
  const { status, account } = usePractice();
  const [readAt, setReadAt] = useLocal<number>(READ_KEY, 0);
  const now = useNow(30_000);
  if (status !== "ready" || !account) {
    return (
      <main className="mx-auto max-w-xl px-4 pt-10 pb-8 sm:px-6">
        <h1 className="h-display text-[56px]">Notifications</h1>
        <p className="mt-2 mb-6 text-ink-2">Settled rounds, wins to claim and refunds.</p>
        <PracticeGate why="to see notifications" />
      </main>
    );
  }
  const events = account.positions
    .filter((p) => p.payout !== undefined)
    .sort((a, b) => b.end - a.end)
    .slice(0, 60);
  return (
    <main className="mx-auto max-w-[900px] px-4 pt-8 pb-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">Your practice rounds</p>
          <h1 className="h-display mt-2 text-[56px] sm:text-[72px]">Notifications</h1>
        </div>
        <button type="button" onClick={() => setReadAt(Date.now())} className="btn btn-ghost h-9 px-3 text-[13px]">
          Mark all read
        </button>
      </div>
      <ul className="mt-6 border-t border-ink">
        {events.length === 0 ? (
          <li className="py-12 text-center text-ink-3">
            <Bell className="mx-auto size-6" />
            <p className="mt-2">No settled rounds yet.</p>
          </li>
        ) : null}
        {events.map((p) => {
          const net = (p.payout ?? 0) - p.stake;
          const unread = p.end > readAt;
          const text = p.outcome === "refund" ? "Refunded" : net > 0 ? `Won +${fmtEth(fromMicro(net))} pETH` : net === 0 ? "Stake returned" : `Lost ${fmtEth(fromMicro(p.stake))} pETH`;
          return (
            <li key={p.id} className="flex items-center gap-3 border-b border-line py-3">
              <span className={`size-2 shrink-0 rounded-full ${unread ? "bg-down" : "bg-transparent"}`} />
              <div className="min-w-0 flex-1">
                <Link href={positionHref(p)} className="block truncate text-[14.5px] font-medium hover:underline">
                  {positionTitle(p)} settled · {text}
                </Link>
                <p className="font-mono text-[11.5px] text-ink-3">
                  {typeof p.side === "number" ? `Range ${p.side + 1}` : p.side.toUpperCase()} · {now ? ago(p.end, now) : ""}
                  {!p.claimed && (p.payout ?? 0) > 0 ? " · ready to claim" : ""}
                </p>
              </div>
              {!p.claimed && (p.payout ?? 0) > 0 ? (
                <Link href="/positions" className="btn btn-accent h-8 px-3 text-[12px]">
                  Claim
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
