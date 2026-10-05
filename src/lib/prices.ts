import "server-only";
import { FRAME_MS, type Asset, type Frame, type MarketRef } from "@/config/markets";
import { minuteOpen, minuteSeries, ticker, type Point } from "@/lib/feeds/okx";
import { poolSeries, poolUsdPriceAt } from "@/lib/feeds/pool";
import { feedHistory, feedPriceAt, inEquityHours, latest, QUIET_MS } from "@/lib/feeds/chainlink";
import { blocksBetween, latestBlock, blockAtOrAfter } from "@/lib/feeds/blocks";
import { decide, type Outcome } from "@/lib/rounds";
import type { Store } from "@/lib/chat/store";

/*
 * One price interface over every source in config/markets.ts. A round's lock
 * is the asset's value at the round start and its close is the value at the
 * round end, read the same way for every visitor. Settled results are written
 * to the store once and never recomputed.
 */

/** Seconds after a round ends before it is settled, so the closing reads exist. */
export const SETTLE_GRACE_MS = 20_000;

export async function priceAt(asset: Asset, at: number): Promise<number | null> {
  const s = asset.source;
  try {
    if (s.kind === "okx") return await minuteOpen(s.inst, at);
    if (s.kind === "pool") return await poolUsdPriceAt(s, at);
    if (s.kind === "chainlink") return await feedPriceAt(s.feed, at);
  } catch {
    return null;
  }
  return null;
}

export type Live = { value: number | null; updatedAt: number | null };

/** The value right now: last trade, oracle TWAP, feed answer or block count. */
export async function currentValue(asset: Asset, frame?: Frame, liveStart?: number): Promise<Live> {
  const s = asset.source;
  try {
    if (s.kind === "okx") {
      const t = await ticker(s.inst);
      return { value: t?.last ?? null, updatedAt: t ? Date.now() : null };
    }
    if (s.kind === "pool") return { value: await poolUsdPriceAt(s, Date.now() - 1000), updatedAt: Date.now() };
    if (s.kind === "chainlink") {
      const r = await latest(s.feed);
      return { value: r?.answer ?? null, updatedAt: r?.updatedAt ?? null };
    }
    if (s.kind === "blocks" && frame && liveStart) {
      // Blocks so far in the live round.
      const [top, first] = await Promise.all([latestBlock(), blockAtOrAfter(liveStart)]);
      return { value: first !== null ? top.n - first : null, updatedAt: top.t * 1000 };
    }
  } catch {
    // fall through
  }
  return { value: null, updatedAt: null };
}

export type Status = { open: boolean; note: string | null };

export async function assetStatus(asset: Asset, now = Date.now()): Promise<Status> {
  const s = asset.source;
  if (s.kind === "chainlink") {
    if (s.hours === "24/5" && !inEquityHours(now)) {
      return { open: false, note: "Closed: US equity feeds trade Sunday 8 pm to Friday 8 pm New York time." };
    }
    const r = await latest(s.feed);
    if (!r) return { open: false, note: "Closed: the price feed could not be read." };
    if (now - r.updatedAt > QUIET_MS) {
      return { open: false, note: "Closed: the feed has not moved for over 4 hours, so a round would only refund." };
    }
    return { open: true, note: "The feed publishes on a 0.5% move; a round with no new answer refunds." };
  }
  return { open: true, note: null };
}

/** Lock value of a round (value at its start); for the block metric, the previous window. */
export async function lockValue(m: MarketRef, start: number): Promise<number | null> {
  if (m.asset.source.kind === "blocks") return blocksBetween(start - FRAME_MS[m.frame], start).catch(() => null);
  return priceAt(m.asset, start);
}

export async function closeValue(m: MarketRef, start: number): Promise<number | null> {
  const end = start + FRAME_MS[m.frame];
  if (end > Date.now()) return null;
  if (m.asset.source.kind === "blocks") return blocksBetween(start, end).catch(() => null);
  return priceAt(m.asset, end);
}

export type Result = { lock: number | null; close: number | null; outcome: Outcome; settledAt: number };

const resultKey = (marketId: string, start: number) => `round:result:${marketId}:${start}`;
const memo = new Map<string, Result>();

/**
 * Settled result of a round, computed once after it ends and kept in the
 * store. Returns null while the round is still running or inside the grace.
 */
export async function roundResult(store: Store | null, m: MarketRef, start: number): Promise<Result | null> {
  const end = start + FRAME_MS[m.frame];
  if (Date.now() < end + SETTLE_GRACE_MS) return null;
  const key = resultKey(m.id, start);
  const hit = memo.get(key);
  if (hit) return hit;
  if (store) {
    const raw = await store.get(key).catch(() => null);
    if (raw) {
      const parsed = JSON.parse(raw) as Result;
      memo.set(key, parsed);
      return parsed;
    }
  }
  const status = m.asset.source.kind === "chainlink" ? await assetStatusAt(m.asset, start) : { open: true };
  const [lock, close] = status.open ? await Promise.all([lockValue(m, start), closeValue(m, start)]) : [null, null];
  // A read that failed now might succeed in a minute: only keep decisive or
  // fully read results. Refunds caused by a missing read are retried.
  const outcome = decide(lock, close);
  const result: Result = { lock, close, outcome, settledAt: Date.now() };
  const complete = (lock !== null && close !== null) || !status.open || Date.now() - end > 6 * 60 * 60 * 1000;
  // A failed read is never kept as the result: the round stays pending and is
  // read again later. Only after six hours without a price does it refund.
  if (!complete) return null;
  if (memo.size > 5000) memo.clear();
  memo.set(key, result);
  if (store) await store.setEx(key, JSON.stringify(result), 120 * 24 * 60 * 60).catch(() => {});
  return result;
}

/** Whether a stock market was open when a round started (rounds in closed hours refund). */
async function assetStatusAt(asset: Asset, at: number) {
  const s = asset.source;
  if (s.kind === "chainlink" && s.hours === "24/5" && !inEquityHours(at)) return { open: false };
  return { open: true };
}

/** Chart series for an asset between two times. */
export async function series(asset: Asset, from: number, to: number): Promise<Point[]> {
  const s = asset.source;
  const span = to - from;
  try {
    if (s.kind === "okx") return await minuteSeries(s.inst, from, to, span > 2 * 86400_000 ? "1H" : span > 6 * 3600_000 ? "5m" : "1m");
    if (s.kind === "pool") return await poolSeries(s, from, to, Math.max(30, Math.round(span / 1000 / 90)));
    if (s.kind === "chainlink") return await feedHistory(s.feed, from - 7 * 24 * 3600_000, 30);
  } catch {
    return [];
  }
  return [];
}
