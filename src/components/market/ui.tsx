"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useNow } from "@/components/providers/BoardProvider";
import { countdown, fmtEth, fmtPrice, fromMicro, multiplier, upShare, type Outcome, type Pool } from "@/lib/rounds";

export function valueText(value: number | null | undefined, unit: "usd" | "blocks") {
  if (value === null || value === undefined) return "—";
  return unit === "blocks" ? `${Math.round(value).toLocaleString("en-US")} blocks` : `$${fmtPrice(value)}`;
}

/** Percentage move from lock to now (or block counts compared). */
export function moveOf(lock: number | null | undefined, now: number | null | undefined) {
  if (lock === null || lock === undefined || now === null || now === undefined || lock === 0) return null;
  return ((now - lock) / lock) * 100;
}

export function Move({ pct, className = "" }: { pct: number | null; className?: string }) {
  if (pct === null) return <span className={`num text-ink-3 ${className}`}>—</span>;
  const up = pct > 0;
  const flat = pct === 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`num inline-flex items-center gap-0.5 ${flat ? "text-ink-3" : up ? "text-up" : "text-down"} ${className}`}>
      <Icon className="size-3.5" strokeWidth={2.5} />
      {Math.abs(pct) < 0.0001 && !flat ? "<0.0001" : Math.abs(pct).toFixed(Math.abs(pct) < 0.1 ? 3 : 2)}%
    </span>
  );
}

export function Countdown({ to, className = "" }: { to: number; className?: string }) {
  const now = useNow();
  return <span className={`num ${className}`}>{now === null ? "—" : countdown(to - now)}</span>;
}

/** Thin elapsed-time bar of a running round. */
export function Elapsed({ start, end, className = "", tone = "paper" }: { start: number; end: number; className?: string; tone?: "paper" | "board" }) {
  const now = useNow();
  const pct = now === null ? 0 : Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  return (
    <div className={`h-1 overflow-hidden rounded-full ${tone === "board" ? "bg-chalk/10" : "bg-line"} ${className}`}>
      <div className="h-full rounded-full bg-amber transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function OutcomeChip({ outcome }: { outcome: Outcome | null | undefined }) {
  if (!outcome) return <span className="chip chip-flat">Pending</span>;
  if (outcome === "refund") return <span className="chip chip-amber">Refund</span>;
  return <span className={`chip ${outcome === "up" ? "chip-up" : "chip-down"}`}>{outcome === "up" ? "UP won" : "DOWN won"}</span>;
}

export const fmtMult = (m: number | null) => (m === null ? "—" : `×${m.toFixed(2)}`);

/** UP vs DOWN split of a practice pool, with payout multipliers. */
export function PoolBar({ pool, compact = false, tone = "paper", unit = "pETH" }: { pool: Pool & { count?: number }; compact?: boolean; tone?: "paper" | "board"; unit?: "pETH" | "ETH" }) {
  const share = upShare(pool);
  const total = pool.up + pool.down;
  const dark = tone === "board";
  return (
    <div>
      <div className={`flex h-2 overflow-hidden rounded-full ${dark ? "bg-chalk/10" : "bg-line"}`}>
        {total > 0 ? (
          <>
            <div className="h-full bg-up" style={{ width: `${share * 100}%` }} />
            <div className="h-full bg-down" style={{ width: `${(1 - share) * 100}%` }} />
          </>
        ) : null}
      </div>
      {!compact ? (
        <div className={`mt-1.5 flex justify-between font-mono text-[11px] ${dark ? "text-chalk/70" : "text-ink-2"}`}>
          <span>
            <span className={dark ? "text-[#3fcf86]" : "text-up"}>UP {total ? Math.round(share * 100) : 0}%</span> · {fmtMult(multiplier(pool, "up"))}
          </span>
          <span>{total ? `${fmtEth(fromMicro(total))} ${unit}${pool.count ? ` · ${pool.count}` : ""}` : "empty pool"}</span>
          <span>
            {fmtMult(multiplier(pool, "down"))} · <span className={dark ? "text-[#ff6b4f]" : "text-down"}>DOWN {total ? Math.round((1 - share) * 100) : 0}%</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Short name for an address: chosen practice name or 0x12…cd. */
export function traderName(address: string, name: string | null | undefined) {
  return name ? `@${name}` : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Generated avatar: two bars in hues derived from the address. */
export function Avatar({ address, size = 28 }: { address: string; size?: number }) {
  const h1 = Number.parseInt(address.slice(2, 6), 16) % 360;
  const h2 = (h1 + 140 + (Number.parseInt(address.slice(6, 8), 16) % 80)) % 360;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="shrink-0 rounded-md" aria-hidden="true">
      <rect width="32" height="32" fill={`hsl(${h1} 45% 22%)`} />
      <rect x="6" y="7" width="20" height="8" rx="2" fill={`hsl(${h1} 70% 62%)`} />
      <rect x="6" y="18" width={8 + (Number.parseInt(address.slice(8, 10), 16) % 13)} height="8" rx="2" fill={`hsl(${h2} 75% 60%)`} />
    </svg>
  );
}
