"use client";

import Link from "next/link";
import { useState } from "react";
import { roundsLive } from "@/config/onchain";
import { ChainPositions } from "@/components/onchain/ChainPositions";
import { PnlCurve } from "@/components/pages/PnlCurve";
import { PracticeGate } from "@/components/practice/Gate";
import { PositionList } from "@/components/practice/PositionList";
import { usePractice } from "@/components/providers/PracticeProvider";
import { TOP_UP, TOP_UP_BELOW, fmtEth, fromMicro } from "@/lib/rounds";

export function Positions() {
  const { status, account, claim, topUp } = usePractice();
  const [tab, setTab] = useState<"open" | "claim" | "history">("open");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status !== "ready" || !account) {
    return (
      <main className="mx-auto max-w-xl px-4 pt-10 pb-8 sm:px-6">
        <h1 className="h-display text-[56px]">Positions</h1>
        {roundsLive() ? (
          <div className="mt-6 mb-10">
            <ChainPositions />
          </div>
        ) : null}
        <p className="mt-2 mb-6 text-ink-2">Your practice balance, open calls and payouts to claim.</p>
        <PracticeGate why="to see your positions" />
      </main>
    );
  }
  const ps = [...account.positions].reverse();
  const open = ps.filter((p) => p.payout === undefined);
  const claimable = ps.filter((p) => !p.claimed && (p.payout ?? 0) > 0);
  const history = ps.filter((p) => p.payout !== undefined);
  const s = account.stats;
  const list = tab === "open" ? open : tab === "claim" ? claimable : history;
  const run = async (fn: () => Promise<{ ok: boolean; error?: string; claimed?: number }>, okText: (c?: number) => string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setMsg(r.ok ? okText(r.claimed) : (r.error ?? "Failed."));
  };

  return (
    <main className="mx-auto max-w-[1100px] px-4 pt-8 pb-8 sm:px-6">
      <h1 className="h-display text-[56px] sm:text-[72px]">Positions</h1>
      {roundsLive() ? (
        <div className="mt-6 mb-10">
          <ChainPositions />
        </div>
      ) : null}
      <p className="label mt-6">Practice account · {account.name ? `@${account.name}` : account.address.slice(0, 10)}</p>
      <div className="mt-6 grid gap-5 md:grid-cols-[1fr_1.2fr]">
        <div className="board p-5">
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-chalk/55 uppercase">Practice balance</p>
          <p className="num mt-1 text-[38px] font-semibold" data-testid="balance">
            {fmtEth(fromMicro(account.balance), 5)} <span className="text-[18px] text-chalk/60">pETH</span>
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3 border-t border-chalk/10 pt-3 font-mono text-[12px]">
            <div>
              <p className="text-chalk/50">In rounds</p>
              <p className="mt-0.5">{fmtEth(fromMicro(s.open))}</p>
            </div>
            <div>
              <p className="text-chalk/50">To claim</p>
              <p className="mt-0.5 text-amber">{fmtEth(fromMicro(s.claimable))}</p>
            </div>
            <div>
              <p className="text-chalk/50">Record</p>
              <p className="mt-0.5">
                {s.wins}W {s.losses}L {s.refunds}R
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || s.claimable <= 0}
              onClick={() =>
                run(
                  () => claim(),
                  (c) => `Claimed ${fmtEth(fromMicro(c ?? 0))} pETH.`,
                )
              }
              className="btn btn-accent h-10 px-4 text-[14px]"
              data-testid="claim-all"
            >
              Claim all
            </button>
            <button
              type="button"
              disabled={busy || account.balance >= TOP_UP_BELOW * 1e6}
              onClick={() =>
                run(
                  () => topUp(),
                  () => `Added ${TOP_UP} pETH.`,
                )
              }
              className="btn h-10 border-chalk/25 px-4 text-[14px] text-chalk"
              title={`Unlocks below ${TOP_UP_BELOW} pETH, once a day`}
            >
              Top up {TOP_UP}
            </button>
          </div>
          {msg ? <p className="mt-3 text-[13px] text-chalk/80">{msg}</p> : null}
        </div>
        <PnlCurve positions={account.positions} />
      </div>
      <div className="mt-8 flex gap-1 border-b border-line">
        {(
          [
            ["open", `Open (${open.length})`],
            ["claim", `To claim (${claimable.length})`],
            ["history", `History (${history.length})`],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`-mb-px cursor-pointer border-b-2 px-3 py-2 text-[14px] font-medium ${tab === k ? "border-ink" : "border-transparent text-ink-3"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <PositionList
        positions={list}
        empty={tab === "open" ? "No open positions. Pick a market on the board." : tab === "claim" ? "Nothing to claim." : "No settled positions yet."}
      />
      <p className="mt-6 text-[13px] text-ink-3">
        Public profile:{" "}
        <Link href={`/trader/${account.address}`} className="underline">
          /trader/{account.name ?? account.address.slice(0, 10)}
        </Link>
      </p>
    </main>
  );
}
