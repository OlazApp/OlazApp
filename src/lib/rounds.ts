import { FRAME_MS, type Frame } from "@/config/markets";

/*
 * Round clock and pool maths, shared by the server and the browser.
 *
 * Each market runs back-to-back rounds aligned to UTC boundaries. At any
 * moment one round is LIVE (its lock price is fixed, it ends at the next
 * boundary) and the round after it is OPEN (it takes positions until it locks
 * at that same boundary). Taking a side during the live round would let late
 * entries see most of the move, so entries always go to the open round.
 *
 * Payouts are parimutuel: all stakes in a round form one pot, the protocol
 * keeps FEE_BPS of it when the round is decided, and the winning side splits
 * the rest pro rata to stake. A round refunds every stake, with no fee, when
 * the close equals the lock, when one side has no stakes, or when no price
 * could be read.
 */

export const FEE_BPS = 300; // 3 %
export const FEE_PCT = FEE_BPS / 100;
export const FEE_LABEL = `${FEE_BPS / 100}% fee on decided rounds`;

/** Practice amounts are kept in micro-ETH (1e-6 ETH) so the store can add integers. */
export const MICRO = 1_000_000;
export const toMicro = (eth: number) => Math.round(eth * MICRO);
export const fromMicro = (micro: number) => micro / MICRO;

export const STAKE_PRESETS = [0.001, 0.005, 0.01, 0.05];
export const MIN_STAKE = 0.0005;
export const MAX_STAKE = 0.25;
export const START_BALANCE = 1; // practice ETH on first sign-in
export const TOP_UP = 0.5;
export const TOP_UP_BELOW = 0.01;
export const TOP_UP_EVERY_MS = 24 * 60 * 60 * 1000;

export type Side = "up" | "down";
export type Outcome = "up" | "down" | "refund";

export function roundStart(frame: Frame, at = Date.now()) {
  const ms = FRAME_MS[frame];
  return Math.floor(at / ms) * ms;
}

export function rounds(frame: Frame, at = Date.now()) {
  const ms = FRAME_MS[frame];
  const live = roundStart(frame, at);
  return {
    live: { start: live, end: live + ms },
    open: { start: live + ms, end: live + 2 * ms },
    previous: { start: live - ms, end: live },
  };
}

export const roundId = (marketId: string, start: number) => `${marketId}:${start}`;

export type Pool = { up: number; down: number };

/**
 * What one unit staked on `side` returns if that side wins, after the fee.
 * Null while the side is empty (anything placed there would set the price).
 */
export function multiplier(pool: Pool, side: Side) {
  const mine = pool[side];
  const total = pool.up + pool.down;
  if (mine <= 0 || total <= 0) return null;
  return (total * (1 - FEE_BPS / 10_000)) / mine;
}

/** Estimated return of a new stake if it wins, counting the stake itself into the pot. */
export function estimateReturn(pool: Pool, side: Side, stake: number) {
  const next = { ...pool, [side]: pool[side] + stake };
  const other = side === "up" ? next.down : next.up;
  if (other <= 0) return stake; // nobody on the other side yet: it would refund
  return (stake * (next.up + next.down) * (1 - FEE_BPS / 10_000)) / next[side];
}

/** Payout of a settled position, in the same unit as the stake. */
export function payout(pool: Pool, outcome: Outcome, side: Side, stake: number) {
  if (outcome === "refund" || pool.up <= 0 || pool.down <= 0) return stake;
  if (outcome !== side) return 0;
  return Math.floor((stake * (pool.up + pool.down) * (10_000 - FEE_BPS)) / 10_000 / pool[side]);
}

export function decide(lock: number | null, close: number | null): Outcome {
  if (lock === null || close === null || !Number.isFinite(lock) || !Number.isFinite(close)) return "refund";
  if (close > lock) return "up";
  if (close < lock) return "down";
  return "refund";
}

/** Share of the pot on the UP side, 0.5 when empty. */
export const upShare = (pool: Pool) => (pool.up + pool.down > 0 ? pool.up / (pool.up + pool.down) : 0.5);

/** Monday 00:00 UTC of the week containing `at`. */
export function weekStart(at = Date.now()) {
  const d = new Date(at);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function countdown(ms: number) {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 23) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

export function fmtPrice(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 3 : abs >= 0.01 ? 5 : 7;
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: abs >= 1000 ? 2 : 0 });
}

export function fmtEth(n: number | null | undefined, digits = 4) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtPct(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function fmtCompactUsd(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n)}`;
}

export function ago(at: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
