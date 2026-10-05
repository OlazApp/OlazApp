"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, ExternalLink } from "lucide-react";
import { explorerAddress } from "@/config/brand";
import { ActivityFeed } from "@/components/board/Widgets";
import { Avatar, traderName } from "@/components/market/ui";
import { PnlCurve } from "@/components/pages/PnlCurve";
import { PositionList } from "@/components/practice/PositionList";
import { usePractice, type Position, type Stats } from "@/components/providers/PracticeProvider";
import { fmtEth, fromMicro } from "@/lib/rounds";

type Profile = { address: string; name: string | null; createdAt: number; stats: Stats; positions: Position[] };

export function Trader({ who }: { who: string }) {
  const [p, setP] = useState<Profile | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "not_configured">("loading");
  const [tab, setTab] = useState<"open" | "history">("open");
  const { account } = usePractice();

  useEffect(() => {
    fetch(`/api/practice/trader/${encodeURIComponent(who)}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 503) return setState("not_configured");
        if (!r.ok) return setState("missing");
        setP(await r.json());
        setState("ready");
      })
      .catch(() => setState("missing"));
  }, [who]);

  if (state !== "ready" || !p) {
    return (
      <main className="mx-auto max-w-[1320px] px-4 py-16 text-center sm:px-6">
        <h1 className="h-display text-[48px]">{state === "loading" ? "Loading trader…" : "No practice record"}</h1>
        {state !== "loading" ? (
          <p className="mt-3 text-ink-2">
            {state === "not_configured" ? "Practice storage is not configured on this site yet." : "This wallet has not played a practice round here yet."}
          </p>
        ) : null}
      </main>
    );
  }
  const mine = account?.address === p.address;
  const open = p.positions.filter((x) => x.payout === undefined);
  const history = p.positions.filter((x) => x.payout !== undefined);
  const s = p.stats;
  return (
    <main className="mx-auto grid max-w-[1320px] gap-10 px-4 pt-8 pb-8 sm:px-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar address={p.address} size={72} />
          <div className="min-w-0">
            <p className="label">Practice trader</p>
            <h1 className="h-display mt-1 truncate text-[44px] sm:text-[56px]">{traderName(p.address, p.name)}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-3">
              <a href={explorerAddress(p.address)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono hover:text-ink">
                {p.address.slice(0, 10)}…{p.address.slice(-6)} <ExternalLink className="size-3" />
              </a>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" /> Joined {new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </span>
              {mine ? (
                <Link href="/settings" className="underline">
                  Edit name
                </Link>
              ) : null}
            </p>
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line-2 bg-line sm:grid-cols-4">
          {[
            { k: "All-time P&L", v: `${s.pnl > 0 ? "+" : ""}${fmtEth(fromMicro(s.pnl))}` },
            { k: "This week", v: `${s.weekPnl > 0 ? "+" : ""}${fmtEth(fromMicro(s.weekPnl))}` },
            { k: "Won / lost", v: `${s.wins} / ${s.losses}` },
            { k: "Staked", v: fmtEth(fromMicro(s.wagered), 3) },
          ].map((c) => (
            <div key={c.k} className="bg-card px-4 py-3">
              <dt className="label">{c.k}</dt>
              <dd className="num mt-1 text-[18px] font-semibold">{c.v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5">
          <PnlCurve positions={p.positions} />
        </div>
        <div className="mt-6 flex gap-1 border-b border-line">
          {(
            [
              ["open", `Open (${open.length})`],
              ["history", `History (${history.length})`],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px cursor-pointer border-b-2 px-3 py-2 text-[14px] font-medium ${tab === k ? "border-ink" : "border-transparent text-ink-3"}`}>
              {l}
            </button>
          ))}
        </div>
        <PositionList positions={tab === "open" ? open : history} owner={mine} empty={tab === "open" ? "No open positions." : "No settled positions yet."} />
      </div>
      <aside>
        <ActivityFeed limit={8} />
      </aside>
    </main>
  );
}
