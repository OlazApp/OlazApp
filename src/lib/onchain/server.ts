import "server-only";
import { ETH_USD_POOL, KIND, ONCHAIN_MARKETS, ROUNDS_CONTRACT, TWAP_SECONDS, roundKey, roundsLive, valueToUsd, type OnchainMarket } from "@/config/onchain";
import { feedPriceAt } from "@/lib/feeds/chainlink";
import { ethCall, pad, rpcBatch, signed, uint, words } from "@/lib/feeds/rpc";
import { decodeRounds, encodeGetRounds, type ChainRound } from "@/lib/onchain/calls";

/*
 * Server reads of the OlazRounds contract and of the same oracles it settles
 * against, so the site shows the on-chain pools and the exact price the
 * contract will use, and can hand out Chainlink round ids for settlement.
 */

/** Rounds for (market index, round number) pairs in one eth_call; null when the contract is not live or unreachable. */
export async function chainRounds(refs: { index: number; round: number }[]): Promise<ChainRound[] | null> {
  if (!roundsLive() || refs.length === 0) return null;
  try {
    return decodeRounds(await ethCall(ROUNDS_CONTRACT, encodeGetRounds(refs.map((r) => roundKey(r.index, r.round)))));
  } catch {
    return null;
  }
}

const POOLS = [ETH_USD_POOL, ...new Set(ONCHAIN_MARKETS.filter((m) => m.kind === KIND.TokenPool).map((m) => m.source))];
const observeData = (ago: number) => "0x883bdbfd" + pad(32) + pad(2) + pad(ago + TWAP_SECONDS) + pad(ago);

/** 60-second tick cumulative differences ending at `atSec` for every pool, in one batch. */
const finalDiffs = new Map<number, Map<string, bigint | null>>();
let recentDiffs: { at: number; sec: number; value: Map<string, bigint | null> } | null = null;

async function poolDiffs(atSec: number): Promise<Map<string, bigint | null>> {
  const nowSec = Math.floor(Date.now() / 1000);
  const ago = nowSec - atSec;
  // A boundary a minute in the past can no longer change; the live edge is cached briefly.
  if (ago > 60 && finalDiffs.has(atSec)) return finalDiffs.get(atSec)!;
  if (ago <= 60 && recentDiffs && recentDiffs.sec === atSec && Date.now() - recentDiffs.at < 5000) return recentDiffs.value;
  const rows = await rpcBatch<string>(POOLS.map((pool) => ({ method: "eth_call", params: [{ to: pool, data: observeData(Math.max(0, ago)) }, "latest"] })));
  const value = new Map<string, bigint | null>();
  POOLS.forEach((pool, i) => {
    const hex = rows[i];
    if (!hex) return value.set(pool, null);
    const w = words(hex);
    const offset = Number(uint(w[0])) / 32;
    value.set(pool, signed(w[offset + 2]) - signed(w[offset + 1]));
  });
  if (ago > 60) {
    if (finalDiffs.size > 500) finalDiffs.clear();
    finalDiffs.set(atSec, value);
  } else {
    recentDiffs = { at: Date.now(), sec: atSec, value };
  }
  return value;
}

/**
 * The price the contract would record for a boundary at `atMs`: summed tick
 * cumulatives for pool markets (same signs as OlazRounds) converted to USD,
 * or the Chainlink answer current then for feed markets.
 */
export async function chainPriceAt(m: OnchainMarket, atMs: number): Promise<number | null> {
  const atSec = Math.floor(atMs / 1000);
  if (atSec > Date.now() / 1000) return null;
  if (m.kind === KIND.Feed) return feedPriceAt(m.source, atMs).catch(() => null);
  try {
    const diffs = await poolDiffs(atSec);
    const eth = diffs.get(ETH_USD_POOL);
    if (eth === null || eth === undefined) return null;
    let value = eth; // WETH is token0 of the WETH/USDG pool: + sign
    if (m.kind === KIND.TokenPool) {
      const tok = diffs.get(m.source);
      if (tok === null || tok === undefined) return null;
      value += m.tokenIsToken0 ? tok : -tok;
    }
    return valueToUsd(m, value);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ feed hints

type FeedRound = { id: bigint; updatedAt: number };

const decodeRound = (hex: string | null): FeedRound | null => {
  if (!hex) return null;
  const w = words(hex);
  if (w.length < 5) return null;
  const updatedAt = Number(uint(w[3]));
  return updatedAt ? { id: uint(w[0]), updatedAt } : null;
};

async function roundData(feed: string, id: bigint) {
  try {
    return decodeRound(await ethCall(feed, "0x9a6fc8f5" + pad(id)));
  } catch {
    return null;
  }
}

/**
 * Chainlink round id that was current at unix second `t`: the last round
 * updated at or before it. Read fresh (not cached) because the contract
 * checks the next round against the chain as it is now.
 */
export async function feedRoundAt(feed: string, t: number): Promise<bigint | null> {
  const head = decodeRound(await ethCall(feed, "0xfeaf968c").catch(() => null));
  if (!head) return null;
  if (head.updatedAt <= t) return head.id;
  const phase = head.id >> 64n;
  const last = head.id & 0xffffffffffffffffn;
  const at = (n: bigint) => (phase << 64n) | n;

  // Most lookups are for the last hour or two: try the recent rounds in one batch.
  const recent: bigint[] = [];
  for (let k = 1n; k <= 16n && last - k >= 1n; k++) recent.push(last - k);
  const rows = await rpcBatch<string>(recent.map((n) => ({ method: "eth_call", params: [{ to: feed, data: "0x9a6fc8f5" + pad(at(n)) }, "latest"] }))).catch(
    () => [] as (string | null)[],
  );
  for (let i = 0; i < rows.length; i++) {
    const r = decodeRound(rows[i]);
    if (r && r.updatedAt <= t) return r.id;
  }

  // Binary search for the last round with updatedAt <= t within this phase.
  let lo = 1n;
  let hi = last - BigInt(recent.length);
  let found: bigint | null = null;
  for (let guard = 0; guard < 64 && lo <= hi; guard++) {
    const mid = (lo + hi) / 2n;
    const r = await roundData(feed, at(mid));
    if (r && r.updatedAt <= t) {
      found = r.id;
      lo = mid + 1n;
    } else {
      hi = mid - 1n;
    }
  }
  return found;
}

/** Hints for settle(): round ids current at the round's start and end (zero for pool markets). */
export async function settleHints(m: OnchainMarket, round: number) {
  if (m.kind !== KIND.Feed) return { lockHint: 0n, closeHint: 0n };
  const start = round * m.durationS;
  const [lockHint, closeHint] = await Promise.all([feedRoundAt(m.source, start), feedRoundAt(m.source, start + m.durationS)]);
  if (lockHint === null || closeHint === null) return null;
  return { lockHint, closeHint };
}

export const marketByIndex = (index: number) => ONCHAIN_MARKETS[index] ?? null;
