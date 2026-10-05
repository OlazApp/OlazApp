"use client";

import Link from "next/link";
import { useState } from "react";
import { AssetLogo } from "@/components/AssetLogo";
import { useNow } from "@/components/providers/BoardProvider";
import { usePractice, type Position } from "@/components/providers/PracticeProvider";
import { positionHref, positionLogo, positionTitle, stateOf } from "@/components/practice/positionLabel";
import { useClock } from "@/components/providers/useLocal";
import { countdown, fmtEth, fromMicro } from "@/lib/rounds";

const STATE_CHIP: Record<string, string> = {
  open: "chip-flat",
  live: "chip-amber",
  settling: "chip-flat",
  won: "chip-up",
  lost: "chip-down",
  refund: "chip-amber",
};

/** Practice positions as rows, with a claim button on unclaimed payouts. */
export function PositionList({ positions, owner = true, empty }: { positions: Position[]; owner?: boolean; empty?: string }) {
  const now = useNow();
  const { claim } = usePractice();
  const { time } = useClock();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (positions.length === 0) return <p className="py-8 text-center text-[14px] text-ink-3">{empty ?? "No positions yet."}</p>;
  return (
    <div>
      {msg ? <p className="mb-2 text-[13px] text-ink-2">{msg}</p> : null}
      <ul>
        {positions.map((p) => {
          const st = now === null ? "open" : stateOf(p, now);
          const side = typeof p.side === "number" ? `Range ${p.side + 1}` : p.side.toUpperCase();
          const claimable = owner && !p.claimed && (p.payout ?? 0) > 0;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line py-3" data-testid="position-row">
              <AssetLogo src={positionLogo(p)} symbol={p.market} size={30} />
              <div className="min-w-0 flex-1">
                <Link href={positionHref(p)} className="block text-[14px] font-medium break-words hover:underline">
                  {positionTitle(p)}
                </Link>
                <p className="font-mono text-[11.5px] break-words text-ink-3">
                  <span className={p.side === "up" ? "text-up" : p.side === "down" ? "text-down" : "text-amber-deep"}>{side}</span> ·{" "}
                  {fmtEth(fromMicro(p.stake))} pETH · {p.kind === "week" ? "week of " : ""}
                  {time(p.start, true)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`chip ${STATE_CHIP[st]}`}>
                  {st === "open" && now ? `locks ${countdown(p.start - now)}` : st === "live" && now ? `ends ${countdown(p.end - now)}` : st}
                </span>
                {p.payout !== undefined ? (
                  <span className={`num w-[92px] text-right text-[13px] font-semibold ${p.payout - p.stake > 0 ? "text-up" : p.payout - p.stake < 0 ? "text-down" : "text-ink-2"}`}>
                    {p.payout - p.stake > 0 ? "+" : ""}
                    {fmtEth(fromMicro(p.payout - p.stake))}
                  </span>
                ) : (
                  <span className="num w-[92px] text-right text-[12px] text-ink-3">—</span>
                )}
                {claimable ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={async () => {
                      setBusy(p.id);
                      const r = await claim([p.id]);
                      setBusy(null);
                      setMsg(r.ok ? `Claimed ${fmtEth(fromMicro(r.claimed ?? 0))} pETH.` : r.error);
                    }}
                    className="btn btn-accent h-8 px-3 text-[12px]"
                    data-testid="claim-one"
                  >
                    {busy === p.id ? "…" : "Claim"}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
