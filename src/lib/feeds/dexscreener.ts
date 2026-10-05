import "server-only";

/*
 * Market stats for Robinhood Chain tokens from the public Dexscreener API:
 * the deepest pair per token gives price, 24 h change, market cap and volume.
 * Display only; round prices come from the pool oracle, never from here.
 */

export type TokenStats = {
  address: string;
  priceUsd: number | null;
  change24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  liquidity: number | null;
};

type Pair = {
  baseToken: { address: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  marketCap?: number;
  fdv?: number;
  volume?: { h24?: number };
  liquidity?: { usd?: number };
};

let cache: { at: number; key: string; value: TokenStats[] } | null = null;

export async function tokenStats(addresses: string[]): Promise<TokenStats[]> {
  const key = addresses.join(",").toLowerCase();
  if (cache && cache.key === key && Date.now() - cache.at < 30_000) return cache.value;
  try {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/robinhood/${key}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const pairs = (await res.json()) as Pair[];
    const value = addresses.map((address) => {
      const mine = pairs
        .filter((p) => p.baseToken.address.toLowerCase() === address.toLowerCase())
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
      const best = mine[0];
      return {
        address,
        priceUsd: best?.priceUsd ? Number(best.priceUsd) : null,
        change24h: best?.priceChange?.h24 ?? null,
        marketCap: best?.marketCap ?? best?.fdv ?? null,
        volume24h: mine.reduce((sum, p) => sum + (p.volume?.h24 ?? 0), 0) || null,
        liquidity: best?.liquidity?.usd ?? null,
      };
    });
    cache = { at: Date.now(), key, value };
    return value;
  } catch {
    return cache?.value ?? addresses.map((address) => ({ address, priceUsd: null, change24h: null, marketCap: null, volume24h: null, liquidity: null }));
  }
}
