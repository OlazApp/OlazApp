import "server-only";
import { ethCall, pad, signed, words, RpcError } from "@/lib/feeds/rpc";
import { minuteOpen, minuteSeries, ticker, type Point } from "@/lib/feeds/okx";

/*
 * Robinhood Chain tokens priced from their Uniswap v3 pool's built-in oracle.
 * observe(secondsAgos) returns cumulative ticks at past moments, read at the
 * latest block, so a past round boundary can be priced without an archive
 * node. Price at time T = time-weighted average over [T - 30 s, T], which one
 * last-second trade cannot push around. The ETH price is converted to USD with
 * the OKX ETH-USDT candle of the same minute.
 */

export const TWAP_SECONDS = 30;

type PoolSource = { pool: string; tokenIsToken0: boolean; decimals: number };

async function observe(pool: string, secondsAgos: number[]): Promise<bigint[] | null> {
  const data =
    "0x883bdbfd" + pad(32) + pad(secondsAgos.length) + secondsAgos.map((s) => pad(Math.max(0, Math.floor(s)))).join("");
  try {
    const w = words(await ethCall(pool, data));
    const offset = Number(BigInt(`0x${w[0]}`)) / 32;
    const length = Number(BigInt(`0x${w[offset]}`));
    return Array.from({ length }, (_, i) => signed(w[offset + 1 + i]));
  } catch (error) {
    // "OLD": the moment is older than the oracle's history.
    if (error instanceof RpcError && error.revert) return null;
    throw error;
  }
}

const tickToEth = (tick: number, src: PoolSource) => {
  // Both sides use 18 decimals (WETH and these tokens), so no decimal shift.
  const p = Math.pow(1.0001, tick) * Math.pow(10, src.decimals - 18);
  return src.tokenIsToken0 ? p : 1 / p;
};

const settled = new Map<string, number>();

/** Token price in ETH at time `at` (ms), or null when it cannot be read. */
export async function poolEthPriceAt(src: PoolSource, at: number): Promise<number | null> {
  const now = Date.now();
  if (at > now) return null;
  const key = `${src.pool}:${Math.floor(at / 1000)}`;
  const hit = settled.get(key);
  if (hit !== undefined) return hit;
  const ago = Math.floor((now - at) / 1000);
  const cums = await observe(src.pool, [ago + TWAP_SECONDS, ago]);
  if (!cums) return null;
  const tick = Number(cums[1] - cums[0]) / TWAP_SECONDS;
  const value = tickToEth(tick, src);
  if (!Number.isFinite(value) || value <= 0) return null;
  // Points older than a minute can no longer change.
  if (ago > 60) {
    if (settled.size > 20_000) settled.clear();
    settled.set(key, value);
  }
  return value;
}

/** Token price in USD at time `at`: pool TWAP in ETH times the ETH-USDT minute open. */
export async function poolUsdPriceAt(src: PoolSource, at: number): Promise<number | null> {
  const [eth, ethUsd] = await Promise.all([
    poolEthPriceAt(src, at),
    Date.now() - at < 60_000 ? ticker("ETH-USDT").then((t) => t?.last ?? null) : minuteOpen("ETH-USDT", at),
  ]);
  return eth !== null && ethUsd !== null ? eth * ethUsd : null;
}

/** USD series from the pool oracle, one point per `step` seconds, oldest first. */
export async function poolSeries(src: PoolSource, from: number, to: number, step: number): Promise<Point[]> {
  const now = Date.now();
  const end = Math.min(to, now);
  const times: number[] = [];
  for (let t = from; t <= end; t += step * 1000) times.push(t);
  if (times[times.length - 1] !== end) times.push(end);
  if (times.length < 2) return [];
  const agos = times.map((t) => Math.floor((now - t) / 1000));
  // One extra observation before the first point gives the first average.
  const cums = await observe(src.pool, [agos[0] + step, ...agos]).catch(() => null);
  if (!cums) return [];
  const span = end - from;
  const eth = await minuteSeries("ETH-USDT", from - 60 * 60_000, end, span > 2 * 86400_000 ? "1H" : span > 6 * 3600_000 ? "5m" : "1m");
  const ethAt = (t: number) => {
    let best: Point | null = null;
    for (const p of eth) if (p.t <= t) best = p;
    return best?.p ?? eth[0]?.p ?? null;
  };
  const out: Point[] = [];
  for (let i = 0; i < times.length; i++) {
    const span = (i === 0 ? step : agos[i - 1] - agos[i]) || 1;
    const tick = Number(cums[i + 1] - cums[i]) / span;
    const usd = ethAt(times[i]);
    if (usd !== null) out.push({ t: times[i], p: tickToEth(tick, src) * usd });
  }
  return out;
}
