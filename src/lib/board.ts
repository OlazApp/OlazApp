import "server-only";
import { ASSETS, MARKETS, question, type Asset, type MarketRef } from "@/config/markets";
import { getStore, type Store } from "@/lib/chat/store";
import { tokenStats } from "@/lib/feeds/dexscreener";
import { ticker } from "@/lib/feeds/okx";
import { feedPriceAt } from "@/lib/feeds/chainlink";
import { assetStatus, currentValue, lockValue, roundResult, type Status } from "@/lib/prices";
import { countKey, poolKey } from "@/lib/practice/ledger";
import { rounds, type Outcome } from "@/lib/rounds";
import { ONCHAIN_MARKETS, onchainIndex, roundNumber, roundsLive } from "@/config/onchain";
import { weiToMicro } from "@/lib/onchain/calls";
import { chainPriceAt, chainRounds } from "@/lib/onchain/server";

/*
 * Everything the board shows, assembled on the server from the real feeds and
 * the practice pools, cached for a few seconds so many visitors cost the same
 * as one.
 */

export type PoolView = { up: number; down: number; count: number };

export type MarketSnapshot = {
  id: string;
  assetId: string;
  frame: MarketRef["frame"];
  question: string;
  status: Status;
  live: { start: number; end: number; lock: number | null; pool: PoolView };
  open: { start: number; end: number; pool: PoolView };
  last: { start: number; outcome: Outcome; lock: number | null; close: number | null } | null;
  /** Real-ETH rounds, when the contract is deployed and lists this market. Pools in micro-ETH. */
  chain: ChainView | null;
};

export type ChainView = {
  index: number;
  liveRound: number;
  openRound: number;
  live: PoolView;
  open: PoolView;
  /** Lock and current price exactly as the contract reads them (USD). */
  lock: number | null;
  now: number | null;
};

export type AssetSnapshot = {
  id: string;
  symbol: string;
  name: string;
  category: Asset["category"];
  logo: string | null;
  unit: Asset["unit"];
  sourceLabel: string;
  address: string | null;
  value: number | null;
  updatedAt: number | null;
  change24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  status: Status;
};

export type Board = { at: number; assets: AssetSnapshot[]; markets: MarketSnapshot[]; storage: boolean };

async function poolsFor(store: Store | null, refs: { market: string; start: number }[]) {
  if (!store) return refs.map(() => ({ up: 0, down: 0, count: 0 }));
  const keys = refs.flatMap((r) => [poolKey(r.market, r.start, "up"), poolKey(r.market, r.start, "down"), countKey(r.market, r.start)]);
  const values = await store.mget(keys).catch(() => keys.map(() => null));
  return refs.map((_, i) => ({
    up: Number(values[i * 3] ?? 0) || 0,
    down: Number(values[i * 3 + 1] ?? 0) || 0,
    count: Number(values[i * 3 + 2] ?? 0) || 0,
  }));
}

async function assetSnapshot(asset: Asset, chainStats: Awaited<ReturnType<typeof tokenStats>>): Promise<AssetSnapshot> {
  const blocksFrame = asset.source.kind === "blocks" ? "15m" : undefined;
  const liveStart = blocksFrame ? rounds(blocksFrame).live.start : undefined;
  const [value, status] = await Promise.all([currentValue(asset, blocksFrame, liveStart), assetStatus(asset)]);
  let change24h: number | null = null;
  let marketCap: number | null = null;
  let volume24h: number | null = null;
  const s = asset.source;
  if (s.kind === "okx") change24h = (await ticker(s.inst))?.change24h ?? null;
  if (s.kind === "pool") {
    const stats = chainStats.find((x) => x.address.toLowerCase() === s.token.toLowerCase());
    change24h = stats?.change24h ?? null;
    marketCap = stats?.marketCap ?? null;
    volume24h = stats?.volume24h ?? null;
  }
  if (s.kind === "chainlink" && value.value !== null) {
    const before = await feedPriceAt(s.feed, Date.now() - 24 * 3600_000).catch(() => null);
    change24h = before ? ((value.value - before) / before) * 100 : null;
  }
  return {
    id: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    category: asset.category,
    logo: asset.logo,
    unit: asset.unit,
    sourceLabel: asset.sourceLabel,
    address: asset.address ?? null,
    value: value.value,
    updatedAt: value.updatedAt,
    change24h,
    marketCap,
    volume24h,
    status,
  };
}

async function chainViews(): Promise<Map<string, ChainView>> {
  const out = new Map<string, ChainView>();
  if (!roundsLive()) return out;
  const refs = ONCHAIN_MARKETS.flatMap((m, index) => {
    const live = Math.floor(Date.now() / 1000 / m.durationS);
    return [
      { index, round: live },
      { index, round: live + 1 },
    ];
  });
  const [pools, prices] = await Promise.all([
    chainRounds(refs),
    Promise.all(
      ONCHAIN_MARKETS.map(async (m) => {
        const liveStart = roundNumber(m, Date.now()) * m.durationS * 1000;
        const [lock, now] = await Promise.all([chainPriceAt(m, liveStart), chainPriceAt(m, Date.now())]);
        return { lock, now };
      }),
    ),
  ]);
  const view = (r: { up: bigint; down: bigint } | undefined): PoolView =>
    r ? { up: weiToMicro(r.up), down: weiToMicro(r.down), count: 0 } : { up: 0, down: 0, count: 0 };
  ONCHAIN_MARKETS.forEach((m, index) => {
    out.set(m.id, {
      index,
      liveRound: refs[index * 2].round,
      openRound: refs[index * 2 + 1].round,
      live: view(pools?.[index * 2]),
      open: view(pools?.[index * 2 + 1]),
      lock: prices[index].lock,
      now: prices[index].now,
    });
  });
  return out;
}

async function marketSnapshot(store: Store | null, m: MarketRef, status: Status, pools: PoolView[], chain: ChainView | null): Promise<MarketSnapshot> {
  const r = rounds(m.frame);
  const [lock, last] = await Promise.all([
    status.open || m.asset.source.kind !== "chainlink" ? lockValue(m, r.live.start).catch(() => null) : Promise.resolve(null),
    roundResult(store, m, r.previous.start).catch(() => null),
  ]);
  return {
    id: m.id,
    assetId: m.asset.id,
    frame: m.frame,
    question: question(m.asset, m.frame),
    status,
    live: { ...r.live, lock, pool: pools[0] },
    open: { ...r.open, pool: pools[1] },
    last: last ? { start: r.previous.start, outcome: last.outcome, lock: last.lock, close: last.close } : null,
    chain: onchainIndex(m.id) >= 0 ? chain : null,
  };
}

let cached: { at: number; value: Board } | null = null;
let inflight: Promise<Board> | null = null;

export async function board(): Promise<Board> {
  if (cached && Date.now() - cached.at < 5000) return cached.value;
  inflight ??= (async () => {
    const store = getStore();
    const chainTokens = ASSETS.filter((a) => a.source.kind === "pool").map((a) => (a.source as { token: string }).token);
    const stats = await tokenStats(chainTokens);
    const assets = await Promise.all(ASSETS.map((a) => assetSnapshot(a, stats)));
    const refs = MARKETS.flatMap((m) => {
      const r = rounds(m.frame);
      return [
        { market: m.id, start: r.live.start },
        { market: m.id, start: r.open.start },
      ];
    });
    const [pools, chain] = await Promise.all([poolsFor(store, refs), chainViews().catch(() => new Map<string, ChainView>())]);
    const markets = await Promise.all(
      MARKETS.map((m, i) =>
        marketSnapshot(store, m, assets.find((a) => a.id === m.asset.id)!.status, [pools[i * 2], pools[i * 2 + 1]], chain.get(m.id) ?? null),
      ),
    );
    const value: Board = { at: Date.now(), assets, markets, storage: store !== null };
    cached = { at: Date.now(), value };
    return value;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
