"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ActivityFeed, Movers } from "@/components/board/Widgets";
import { Avatar, traderName } from "@/components/market/ui";
import { usePractice } from "@/components/providers/PracticeProvider";
import { fmtEth, fromMicro } from "@/lib/rounds";

type Row = { address: string; name: string | null; createdAt: number; wagered: number; pnl: number; weekPnl: number; wins: number; losses: number; refunds: number; open: number };

export function Leaderboard() {
  const [data, setData] = useState<{ rows: Row[]; traders: number } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not_configured" | "error">("loading");
  const [period, setPeriod] = useState<"week" | "all">("week");
  const { account } = usePractice();

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/practice/leaderboard", { cache: "no-store" })
        .then(async (r) => {
          if (r.status === 503) return !cancelled && setState("not_configured");
          const b = await r.json();
          if (!cancelled) {
            setData(b);
            setState("ready");
          }
        })
        .catch(() => !cancelled && setState("error"));
    load();
    const t = window.setInterval(() => !document.hidden && load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  const key = period === "week" ? "weekPnl" : "pnl";
  const rows = [...(data?.rows ?? [])].sort((a, b) => b[key] - a[key] || b.wagered - a.wagered);

  return (
    <main className="mx-auto grid max-w-[1320px] gap-10 px-4 pt-8 pb-8 sm:px-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <p className="label">Practice results of real visitors</p>
        <h1 className="h-display mt-2 text-[56px] sm:text-[72px]">Leaderboard</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          Ranked by profit in practice ETH from settled rounds. Every row is a wallet that signed in and played; nobody is added for show. The week resets Monday 00:00 UTC.
        </p>
        <div className="mt-6 flex gap-1">
          {(
            [
              ["week", "This week"],
              ["all", "All time"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setPeriod(k)} className={`cursor-pointer rounded-md px-3 py-1.5 text-[14px] ${period === k ? "bg-ink text-chalk" : "text-ink-2 hover:bg-card"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-t border-ink text-left text-[14px]">
            <thead>
              <tr className="border-b border-line">
                {["#", "Trader", period === "week" ? "Week P&L" : "P&L", "Won / lost", "Staked"].map((h, i) => (
                  <th key={h} className={`label py-2.5 font-medium ${i >= 2 ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const me = account?.address === r.address;
                return (
                  <tr key={r.address} className={`border-b border-line ${me ? "bg-amber-soft" : ""}`} data-testid="leader-row">
                    <td className="num w-10 py-3 text-ink-3">{i + 1}</td>
                    <td className="py-3">
                      <Link href={`/trader/${r.address}`} className="flex items-center gap-2.5 hover:underline">
                        <Avatar address={r.address} size={28} />
                        <span className="font-medium">{traderName(r.address, r.name)}</span>
                        {me ? <span className="chip chip-amber">you</span> : null}
                      </Link>
                    </td>
                    <td className={`num py-3 text-right font-semibold ${r[key] > 0 ? "text-up" : r[key] < 0 ? "text-down" : ""}`}>
                      {r[key] > 0 ? "+" : ""}
                      {fmtEth(fromMicro(r[key]))}
                    </td>
                    <td className="num py-3 text-right text-ink-2">
                      {r.wins} / {r.losses}
                    </td>
                    <td className="num py-3 text-right text-ink-2">{fmtEth(fromMicro(r.wagered), 3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {state === "loading" ? <p className="py-10 text-center text-ink-3">Loading…</p> : null}
          {state === "not_configured" ? <p className="py-10 text-center text-ink-3">The leaderboard opens once practice storage is configured on this site.</p> : null}
          {state === "error" ? <p className="py-10 text-center text-ink-3">Could not load the leaderboard.</p> : null}
          {state === "ready" && rows.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-[16px] font-medium">No settled practice rounds yet.</p>
              <p className="mt-1 text-ink-3">Take a side on the board; your result lands here when the round settles.</p>
              <Link href="/" className="btn btn-ink mt-5 h-10 px-5">
                Open the board
              </Link>
            </div>
          ) : null}
        </div>
      </div>
      <aside className="space-y-10">
        <Movers limit={5} />
        <ActivityFeed limit={6} />
      </aside>
    </main>
  );
}
