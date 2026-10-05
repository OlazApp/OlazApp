"use client";

import Link from "next/link";
import { useState } from "react";
import { Countdown, PoolBar, fmtMult } from "@/components/market/ui";
import { ChainEntry } from "@/components/market/ChainEntry";
import { PracticeGate } from "@/components/practice/Gate";
import { usePractice } from "@/components/providers/PracticeProvider";
import { STAKE_KEY, useLocal } from "@/components/providers/useLocal";
import type { MarketSnapshot } from "@/lib/board";
import { isOnchainMarket } from "@/config/onchain";
import { MAX_STAKE, MIN_STAKE, STAKE_PRESETS, estimateReturn, fmtEth, fromMicro, multiplier, toMicro, type Side } from "@/lib/rounds";

/** Take a side in the market's open round: real ETH through the contract when it lists this market, or practice ETH. */
export function EntryPanel({ market, initialSide, ethUsd }: { market: MarketSnapshot; initialSide: Side | null; ethUsd: number | null }) {
  const { status, account, enter } = usePractice();
  const [side, setSide] = useState<Side>(initialSide ?? "up");
  const [stakePref, setStakePref] = useLocal<number>(STAKE_KEY, 0.005);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [mode, setMode] = useState<"real" | "practice">(market.chain ? "real" : "practice");
  const real = mode === "real" && market.chain !== null;

  const stakeText = draft ?? String(stakePref);
  const stake = Number(stakeText);
  const valid = Number.isFinite(stake) && stake >= MIN_STAKE && stake <= MAX_STAKE;
  const pool = market.open.pool;
  const est = valid ? fromMicro(estimateReturn(pool, side, toMicro(stake))) : null;
  const mine = account?.positions.find((p) => p.kind === "round" && p.market === market.id && p.start === market.open.start);
  const balance = account ? fromMicro(account.balance) : null;
  const closed = !market.status.open;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setNote(null);
    const r = await enter(market.id, side, stake);
    setBusy(false);
    if (r.ok) {
      setStakePref(stake);
      setDraft(null);
      setNote({ ok: true, text: `${side.toUpperCase()} · ${fmtEth(stake)} pETH placed in the round that locks at the next boundary.` });
    } else setNote({ ok: false, text: r.error });
  };

  return (
    <div className="panel overflow-hidden" data-testid="entry-panel">
      <div className="flex items-center justify-between gap-3 bg-board px-4 py-3 text-chalk">
        <div>
          <p className="font-mono text-[10px] tracking-[0.08em] text-chalk/55 uppercase">Next round</p>
          <p className="text-[14px] font-semibold">{closed ? "Market closed" : "Taking positions"}</p>
        </div>
        {!closed ? (
          <div className="text-right">
            <p className="font-mono text-[10px] tracking-[0.08em] text-chalk/55 uppercase">Locks in</p>
            <Countdown to={market.open.start} className="text-[18px] font-semibold text-amber" />
          </div>
        ) : null}
      </div>
      <div className="space-y-4 p-4">
        {closed ? <p className="text-[13.5px] leading-relaxed text-ink-2">{market.status.note}</p> : null}
        {market.chain ? (
          <div className="grid grid-cols-2 gap-1 rounded-md border border-line-2 bg-paper p-1" role="tablist" aria-label="Stake with">
            {(
              [
                ["real", "Real ETH"],
                ["practice", "Practice"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={mode === k}
                onClick={() => setMode(k)}
                className={`cursor-pointer rounded px-2 py-1.5 text-[13px] font-semibold ${mode === k ? "bg-ink text-chalk" : "text-ink-2 hover:text-ink"}`}
                data-testid={`mode-${k}`}
              >
                {l}
              </button>
            ))}
          </div>
        ) : null}
        {real ? (
          <ChainEntry market={market} side={side} setSide={setSide} ethUsd={ethUsd} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Side">
              {(["up", "down"] as Side[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={side === s}
                  onClick={() => setSide(s)}
                  disabled={Boolean(mine && mine.side !== s)}
                  className={`btn h-14 flex-col gap-0 border text-[16px] ${
                    side === s ? (s === "up" ? "btn-up border-up" : "btn-down border-down") : "border-line-2 bg-card text-ink hover:border-ink"
                  }`}
                  data-testid={`side-${s}`}
                >
                  {s === "up" ? "UP" : "DOWN"}
                  <span className="num text-[11px] font-medium opacity-80">pays {fmtMult(multiplier(pool, s))}</span>
                </button>
              ))}
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="stake" className="label">
                  Stake (pETH)
                </label>
                <span className="font-mono text-[11px] text-ink-3">Balance {balance === null ? "—" : fmtEth(balance)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id="stake"
                  inputMode="decimal"
                  value={stakeText}
                  onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="field num text-[18px] font-semibold"
                  data-testid="stake-input"
                />
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {STAKE_PRESETS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setDraft(String(v))}
                    className={`cursor-pointer rounded-md border py-1.5 font-mono text-[12px] ${stake === v ? "border-ink bg-ink text-chalk" : "border-line-2 bg-card hover:border-ink"}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-ink-3">
                {valid ? (ethUsd ? `≈ $${(stake * ethUsd).toFixed(2)} at the ETH price` : " ") : `Between ${MIN_STAKE} and ${MAX_STAKE} pETH`}
              </p>
            </div>
            <div className="rounded-md bg-paper px-3 py-2.5">
              <div className="flex justify-between text-[13px]">
                <span className="text-ink-2">If {side.toUpperCase()} wins, you get</span>
                <span className="num font-semibold">{est === null ? "—" : `${fmtEth(est, 5)} pETH`}</span>
              </div>
              <p className="mt-1 text-[11.5px] leading-snug text-ink-3">
                Estimate from the pool right now. It moves as others enter until the round locks. Empty other side = refund.
              </p>
            </div>
            <PoolBar pool={pool} />
            {status === "ready" ? (
              <button
                type="button"
                onClick={submit}
                disabled={busy || !valid || closed}
                className={`btn h-12 w-full text-[15px] ${side === "up" ? "btn-up" : "btn-down"}`}
                data-testid="enter-submit"
              >
                {busy ? "Placing…" : mine ? `Add to ${side.toUpperCase()}` : `Place ${side.toUpperCase()} · practice`}
              </button>
            ) : (
              <PracticeGate compact />
            )}
            {note ? (
              <p className={`text-[13px] ${note.ok ? "text-up" : "text-down"}`} data-testid="enter-note">
                {note.text}
              </p>
            ) : null}
            {mine ? (
              <p className="text-[12.5px] text-ink-2">
                Your stake in this round:{" "}
                <span className="num font-semibold">
                  {fmtEth(fromMicro(mine.stake))} pETH {String(mine.side).toUpperCase()}
                </span>{" "}
                ·{" "}
                <Link href="/positions" className="underline">
                  Positions
                </Link>
              </p>
            ) : null}
            <p className="border-t border-line pt-3 text-[11.5px] leading-relaxed text-ink-3">
              {market.chain
                ? "Practice ETH has no value. Switch to Real ETH above to stake through the round contract."
                : isOnchainMarket(market.id)
                  ? "Practice ETH has no value. Real ETH staking goes live when the round contract is deployed on Robinhood Chain."
                  : "Practice ETH has no value. This market has no on-chain price source, so it stays practice-only."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
