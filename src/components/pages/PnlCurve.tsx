"use client";

import { useState } from "react";
import { useNow } from "@/components/providers/BoardProvider";
import type { Position } from "@/components/providers/PracticeProvider";
import { fmtEth, fromMicro } from "@/lib/rounds";

const RANGES = [
  { k: "24h", ms: 86400_000 },
  { k: "7d", ms: 7 * 86400_000 },
  { k: "30d", ms: 30 * 86400_000 },
  { k: "All", ms: Infinity },
] as const;

/** Cumulative practice profit from settled positions, by round end time. */
export function PnlCurve({ positions }: { positions: Position[] }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["k"]>("All");
  const now = useNow(60_000) ?? 0;
  const ms = RANGES.find((r) => r.k === range)!.ms;
  const settled = positions.filter((p) => p.payout !== undefined).sort((a, b) => a.end - b.end);
  const since = ms === Infinity || !now ? 0 : now - ms;
  let acc = 0;
  const pts: { t: number; v: number }[] = [];
  for (const p of settled) {
    if (p.end < since) continue;
    acc += (p.payout ?? 0) - p.stake;
    pts.push({ t: p.end, v: acc });
  }
  const W = 600;
  const H = 150;
  const vals = [0, ...pts.map((p) => p.v)];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const y = (v: number) => 10 + (1 - (v - lo) / span) * (H - 20);
  const x = (i: number) => (pts.length <= 1 ? W : (i / (pts.length - 1)) * W);
  const d = pts.length ? `M0 ${y(0)} ` + pts.map((p, i) => `L${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ") : "";
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="label">P&amp;L · {range}</p>
          <p className={`num mt-1 text-[24px] font-semibold ${acc > 0 ? "text-up" : acc < 0 ? "text-down" : ""}`}>
            {acc > 0 ? "+" : ""}
            {fmtEth(fromMicro(acc))} pETH
          </p>
        </div>
        <div className="flex gap-0.5 rounded-md bg-paper p-0.5">
          {RANGES.map((r) => (
            <button key={r.k} type="button" onClick={() => setRange(r.k)} className={`cursor-pointer rounded px-2 py-1 font-mono text-[11px] ${range === r.k ? "bg-ink text-chalk" : "text-ink-2"}`}>
              {r.k}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" aria-label="Profit curve">
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="rgba(17,23,20,0.15)" strokeDasharray="4 4" />
        {d ? <path d={d} fill="none" stroke={acc >= 0 ? "#0f8a4f" : "#d8432b"} strokeWidth="2.2" /> : null}
        {!d ? (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="13" fill="#767e7a">
            No settled rounds in this range
          </text>
        ) : null}
      </svg>
    </div>
  );
}
